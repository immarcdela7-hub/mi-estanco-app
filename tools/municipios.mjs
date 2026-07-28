// Municipios catalanes de mas de 50.000 habitantes, desde Idescat (fuente
// citable, no de memoria). Salida: tools/municipios.json.
//
// Idescat expone el indicador f171 (poblacion) de TODOS los municipios en una
// sola llamada, con el año del padron y la fuente dentro de la propia respuesta.
//
//   node municipios.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'tools', 'municipios.json');
const API = 'https://api.idescat.cat/emex/v1/dades.json?i=f171&tipus=mun';
const MINIMO = 50000;

// Idescat escribe el articulo al final ("Hospitalet de Llobregat, l'"), que es
// como se ordena alfabeticamente pero no como se escribe ni como lo grabaria el
// CRM. Se devuelve al principio: "l'Hospitalet de Llobregat".
function nombreNatural(s) {
  const m = String(s ?? '').match(/^(.*),\s*(l'|el|la|els|les|es|sa|s')$/i);
  if (!m) return String(s ?? '');
  const art = m[2].toLowerCase();
  return art.endsWith("'") ? art + m[1] : art + ' ' + m[1];
}

// Mismo formato que citySlug() de crm-web/src/lib/qr.ts: si no coinciden, el
// ?zona= del cartel no encuentra nada y el filtro se cae a la provincia.
function slug(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// El id de municipio del INE empieza por la provincia: 08 Barcelona, 17 Girona,
// 25 Lleida, 43 Tarragona.
const PROV_POR_ID = { '08': 'barcelona', '17': 'girona', '25': 'lleida', '43': 'tarragona' };

const r = await fetch(API);
if (!r.ok) throw new Error('Idescat respondio ' + r.status);
const d = await r.json();
const f = d.fitxes;
const ind = f.indicadors.i;
const cols = f.cols.col;
const valores = String(ind.v).split(',').map((x) => parseInt(x, 10));

if (cols.length !== valores.length) {
  throw new Error(`descuadre: ${cols.length} municipios y ${valores.length} valores`);
}

const todos = cols.map((c, i) => {
  const nombre = nombreNatural(c.content);
  return {
    ine: c.id,
    nombre,
    nombre_idescat: c.content,
    slug: slug(nombre),
    provincia: PROV_POR_ID[String(c.id).slice(0, 2)] || null,
    poblacion: valores[i],
  };
});

const grandes = todos
  .filter((m) => m.poblacion >= MINIMO)
  .sort((a, b) => b.poblacion - a.poblacion);

const salida = {
  fuente: {
    organismo: 'Idescat (Institut d\'Estadistica de Catalunya)',
    indicador: 'f171 — ' + ind.c,
    anyo_padron: ind.r,
    nota: ind.s,
    api: API,
    actualizado_idescat: ind.updated || null,
  },
  criterio: `Municipios de Cataluña con ${MINIMO.toLocaleString('es-ES')} habitantes o mas.`,
  total_municipios_catalunya: todos.length,
  municipios: grandes,
};

writeFileSync(OUT, JSON.stringify(salida, null, 1), 'utf8');
console.log(`${todos.length} municipios en Cataluña; ${grandes.length} con >= ${MINIMO} hab. (padron ${ind.r})`);
console.log(`-> ${path.relative(ROOT, OUT)}`);
console.log(`fuente: ${ind.s}`);
console.log();
grandes.forEach((m, i) => console.log(
  `  ${String(i + 1).padStart(2)}. ${String(m.poblacion).padStart(9)}  ${m.provincia.padEnd(9)} ${m.slug.padEnd(30)} ${m.nombre}`));
