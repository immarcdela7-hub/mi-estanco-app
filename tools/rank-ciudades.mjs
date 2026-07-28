// Top 10 de cada municipio catalan de mas de 50.000 habitantes, y la columna
// `zonas` que lo hace posible.
//
// Dos pasadas, en este orden:
//   a) PRIMERO lo suyo: lo que GetYourGuide tiene EN esa ciudad, ordenado con el
//      mismo criterio de popularidad de la fase 1.
//   b) LUEGO se completa hasta 10 con actividades de los hubs de tools/zonas.json.
//
// La regla que no se cruza: no se toca el `city` de ninguna actividad. Una
// actividad de Barcelona sigue siendo de Barcelona aunque se la ensenemos a
// alguien de Cornella; lo que se anota es a que ciudades SIRVE, en `zonas`.
//
//   node rank-ciudades.mjs           # calcula y enseña la tabla
//   node rank-ciudades.mjs --apply   # ademas escribe la columna zonas en el CSV
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsv, stringifyCsv } from './lib/csv.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSV = path.join(ROOT, 'web', 'catalog.csv');
const MUN = path.join(ROOT, 'tools', 'municipios.json');
const ZONAS = path.join(ROOT, 'tools', 'zonas.json');
const HARVEST = path.join(ROOT, 'tools', 'harvest.json');
const OUT = path.join(ROOT, 'tools', 'top-ciudades.json');
const APLICAR = process.argv.includes('--apply');
const CUANTAS = 10;

const municipios = JSON.parse(readFileSync(MUN, 'utf8')).municipios;
const zonasCfg = JSON.parse(readFileSync(ZONAS, 'utf8'));
const harvest = JSON.parse(readFileSync(HARVEST, 'utf8'));
const { columns, records } = parseCsv(readFileSync(CSV, 'utf8'));

const tidDe = (u) => (String(u).match(/-t(\d+)/) || [])[1] || '';
const senales = new Map(harvest.map((h) => [h.tid, h]));

// Mismo criterio que rank-top50.mjs: resenas en logaritmo + posicion + distintivos.
const BONO = { 'Bestseller': 0.40, 'Likely to sell out': 0.25, 'Top pick': 0.25 };
function puntos(fila) {
  const h = senales.get(tidDe(fila.url_getyourguide));
  if (!h) return parseFloat(fila.rating || 0) / 10;   // sin senales: solo la valoracion
  const base = Math.log10((h.resenas || 0) + 1);
  const pos = Math.min(...(h.apariciones || [{ posicion: 999 }]).map((a) => a.posicion));
  const bonoPos = (1 - Math.min(pos, 100) / 100) * 0.5;
  const bonoDist = (h.distintivos || []).reduce((s, d) => s + (BONO[d] || 0), 0);
  return base + bonoPos + bonoDist;
}

const porCiudad = new Map();   // slug -> [filas]
for (const r of records) {
  const c = (r.city || '').trim().toLowerCase();
  if (!porCiudad.has(c)) porCiudad.set(c, []);
  porCiudad.get(c).push(r);
}
const mejores = (slug) => (porCiudad.get(slug) || []).slice().sort((a, b) => puntos(b) - puntos(a));

// zonas[tid] = Set de ciudades a las que sirve esa actividad (sin su propia city)
const zonasPorFila = new Map(records.map((r) => [r, new Set()]));
const tabla = [];

for (const m of municipios) {
  const cfg = zonasCfg.zonas[m.slug] || { hubs: [] };
  const propias = mejores(m.slug).slice(0, CUANTAS);
  const elegidas = [...propias];
  const deAlrededores = [];

  for (const hub of cfg.hubs) {
    if (elegidas.length >= CUANTAS) break;
    for (const fila of mejores(hub)) {
      if (elegidas.length >= CUANTAS) break;
      if (elegidas.includes(fila)) continue;
      elegidas.push(fila);
      deAlrededores.push(fila);
      // Aqui es donde se anota: esta actividad SIRVE a m.slug.
      zonasPorFila.get(fila).add(m.slug);
    }
  }

  tabla.push({
    slug: m.slug, nombre: m.nombre, provincia: m.provincia, poblacion: m.poblacion,
    propias: propias.length,
    alrededores: deAlrededores.length,
    total: elegidas.length,
    hubs: cfg.hubs,
    completa: elegidas.length >= CUANTAS,
    top: elegidas.map((f) => ({
      tid: tidDe(f.url_getyourguide), titulo: f.titulo, city: f.city,
      propia: f.city === m.slug, puntos: Math.round(puntos(f) * 1000) / 1000,
    })),
  });
}

// El apaño de costadaurada que hoy vive en el codigo pasa a ser dato: las de
// Salou y Cambrils sirven a la zona "costadaurada".
for (const r of records) {
  const c = (r.city || '').trim().toLowerCase();
  if (c === 'salou' || c === 'cambrils') zonasPorFila.get(r).add('costadaurada');
}

const conZonas = [...zonasPorFila.entries()].filter(([, s]) => s.size);
console.log(`${records.length} actividades; ${conZonas.length} sirven a alguna zona ademas de su ciudad`);
console.log();
console.log('ciudad                          hab.   propias  alrededores  total  hubs');
console.log('-'.repeat(88));
for (const t of tabla) {
  const marca = t.completa ? ' ' : '!';
  console.log(`${marca} ${t.slug.padEnd(28)} ${String(t.poblacion).padStart(8)}  ${String(t.propias).padStart(7)}  ${String(t.alrededores).padStart(11)}  ${String(t.total).padStart(5)}  ${t.hubs.join(', ') || '-'}`);
}
const incompletas = tabla.filter((t) => !t.completa);
if (incompletas.length) {
  console.log(`\n! ${incompletas.length} ciudades NO llegan a ${CUANTAS} (no se rellenan a ojo):`);
  incompletas.forEach((t) => console.log(`   ${t.slug}: ${t.total}`));
}

writeFileSync(OUT, JSON.stringify({
  criterio: zonasCfg.criterio,
  cuantas_por_ciudad: CUANTAS,
  fuente_municipios: JSON.parse(readFileSync(MUN, 'utf8')).fuente,
  ciudades: tabla,
}, null, 1), 'utf8');
console.log(`\n-> ${path.relative(ROOT, OUT)}`);

if (APLICAR) {
  const cols = columns.includes('zonas') ? columns.slice() : [...columns, 'zonas'];
  for (const r of records) {
    r.zonas = [...zonasPorFila.get(r)].sort().join('|');
  }
  writeFileSync(CSV, stringifyCsv(cols, records), 'utf8');
  console.log(`APLICADO -> ${path.relative(ROOT, CSV)} (columna zonas)`);
} else {
  console.log('(dry-run) usa --apply para escribir la columna zonas en el CSV');
}
