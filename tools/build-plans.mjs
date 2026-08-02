// Genera web/plans.js (window.NTL_PLANS) desde web/plans.csv, resolviendo cada
// actividad contra el catalogo (web/catalog.csv) por su id de GetYourGuide.
//
//   node tools/build-plans.mjs
//
// Un plan es una lista ordenada de actividades del catalogo con una nota
// nuestra en cada paso: es lo que convierte el escaparate en un consejo.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsv } from './lib/csv.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PLANS = path.join(ROOT, 'web', 'plans.csv');
const CATALOG = path.join(ROOT, 'web', 'catalog.csv');
const OUT = path.join(ROOT, 'web', 'plans.js');

const tidOf = (u) => (String(u).match(/-t(\d+)/) || [])[1] || '';
const split = (v) => String(v || '').split('|').map((s) => s.trim()).filter(Boolean);

// ---- Catalogo indexado por id de actividad ----
const catalog = parseCsv(readFileSync(CATALOG, 'utf8')).records;
const byTid = new Map();
for (const r of catalog) {
  const tid = tidOf(r.url_getyourguide);
  if (tid) byTid.set(tid, r);
}

// ---- Planes ----
const rows = parseCsv(readFileSync(PLANS, 'utf8')).records;
const plans = [];
const problemas = [];

for (const r of rows) {
  if (!r.id) continue;
  const tids = split(r.actividades);
  const notas = split(r.notas);

  if (notas.length && notas.length !== tids.length) {
    problemas.push(`${r.id}: ${tids.length} actividades pero ${notas.length} notas`);
  }

  const pasos = [];
  const ventanas = [];
  for (let i = 0; i < tids.length; i++) {
    const a = byTid.get(tids[i]);
    if (!a) { problemas.push(`${r.id}: la actividad t${tids[i]} no esta en el catalogo`); continue; }
    ventanas.push({ horario: a.horario || '', titulo: a.titulo });
    pasos.push({
      titulo: a.titulo,
      categoriaLabel: a.categoria_label,
      precio: Number(a.precio) || 0,
      precioDisplay: a.precio_display,
      rating: a.rating ? Number(a.rating) : null,
      imagen: a.imagen,
      url: a.url_getyourguide,
      nota: notas[i] || '',
    });
  }
  if (!pasos.length) { problemas.push(`${r.id}: sin actividades validas, se descarta`); continue; }

  // ¿Se puede hacer de verdad, en ese orden? Cada parada tiene que poder
  // empezar despues de la anterior. Los planes con "each" en la duracion son
  // excursiones alternativas, no una cadena: ahi no aplica.
  if (!/each/i.test(String(r.duracion || ''))) {
    const min = (s) => { const [h, m] = s.split(':'); return parseInt(h, 10) * 60 + parseInt(m, 10); };
    let tope = 0;
    for (const v of ventanas) {
      const m = v.horario.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
      if (!m) continue;
      let abre = min(m[1]), cierra = min(m[2]);
      if (cierra < abre) cierra += 1440;          // cruza medianoche
      if (cierra < tope) {
        problemas.push(`${r.id}: "${v.titulo}" cierra a las ${m[2]} y va despues de algo que empieza mas tarde`);
        break;
      }
      tope = Math.max(tope, abre);
    }
  }

  plans.push({
    id: r.id,
    titulo: r.titulo,
    subtitulo: r.subtitulo,
    provincia: r.provincia,
    city: r.city,
    momento: String(r.momento || 'any').split(',').map((s) => s.trim()).filter(Boolean),
    duracion: r.duracion,
    desde: pasos.reduce((n, p) => n + p.precio, 0), // "desde X€" sumando los minimos
    pasos,
  });
}

const banner = '/* GENERADO por tools/build-plans.mjs desde web/plans.csv. No editar a mano. */\n';
writeFileSync(OUT, banner + 'window.NTL_PLANS = ' + JSON.stringify(plans, null, 1) + ';\n', 'utf8');

console.log(`Wrote ${plans.length} planes -> web/plans.js`);
for (const p of plans) console.log(`  ${p.id.padEnd(20)} ${p.pasos.length} pasos  desde ${p.desde}EUR  (${p.provincia})`);
if (problemas.length) {
  console.log('\nAVISOS:');
  problemas.forEach((x) => console.log('  - ' + x));
  process.exitCode = 1;
}
