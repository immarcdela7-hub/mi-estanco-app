// Sustituye la columna `trending` de catalog.csv por `distintivo` y le pone valor
// a cada fila a partir de las señales reales de GetYourGuide:
//
//   travelers-choice  -> esta entre las 25 primeras de tools/top50.json
//   top-pick          -> GYG la marca "Top pick" y NO esta en el top 50
//   (vacio)           -> el resto
//
// Se uso "Top pick" y no "Bestseller" porque, cosechando los 16 listados, GYG no
// marca "Bestseller" a ninguna: seria una pastilla que no se pintaria nunca.
//
// `trending` era una marca puesta a mano (4 filas) que no respondia a ningun dato;
// desaparece: lo que ahora se pinta viene de lo que publica GYG.
//
//   node apply-distintivos.mjs           # dry-run: enseña el reparto
//   node apply-distintivos.mjs --apply   # escribe catalog.csv
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsv, stringifyCsv } from './lib/csv.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSV = path.join(ROOT, 'web', 'catalog.csv');
const TOP = path.join(ROOT, 'tools', 'top50.json');
const HARVEST = path.join(ROOT, 'tools', 'harvest.json');
const APLICAR = process.argv.includes('--apply');

// El catalogo contiene las 50 mas vendidas (fase 1), pero la pastilla se reserva
// a las 25 primeras: con 50 la llevaria el 40% de las tarjetas y un distintivo
// que lleva medio catalogo no distingue nada.
const CORTE = 25;
const top50 = new Set(JSON.parse(readFileSync(TOP, 'utf8')).top.slice(0, CORTE).map((x) => x.tid));
const harvest = JSON.parse(readFileSync(HARVEST, 'utf8'));
const topPicks = new Set(harvest
  .filter((x) => (x.distintivos || []).includes('Top pick'))
  .map((x) => x.tid));

const { columns, records } = parseCsv(readFileSync(CSV, 'utf8'));
const tidDe = (u) => (String(u).match(/-t(\d+)/) || [])[1] || '';

// La columna `distintivo` ocupa el sitio de `trending`, para no mover el resto.
const cols = columns.includes('distintivo')
  ? columns.slice()
  : columns.map((c) => (c === 'trending' ? 'distintivo' : c));
if (!cols.includes('distintivo')) cols.splice(10, 0, 'distintivo');

const antes = records.filter((r) => /^s(i|í)$/i.test((r.trending || '').trim())).length;
const cuenta = { 'travelers-choice': 0, 'top-pick': 0, '': 0 };

for (const r of records) {
  const tid = tidDe(r.url_getyourguide);
  const valor = top50.has(tid) ? 'travelers-choice' : (topPicks.has(tid) ? 'top-pick' : '');
  r.distintivo = valor;
  delete r.trending;
  cuenta[valor]++;
}

console.log(`filas: ${records.length}`);
console.log(`  trending="si" que habia: ${antes}  (marca a mano, se retira)`);
console.log(`  travelers-choice: ${cuenta['travelers-choice']}`);
console.log(`  top-pick        : ${cuenta['top-pick']}`);
console.log(`  sin distintivo  : ${cuenta['']}`);

if (APLICAR) {
  writeFileSync(CSV, stringifyCsv(cols, records), 'utf8');
  console.log(`\nAPLICADO -> ${path.relative(ROOT, CSV)} (columna trending -> distintivo)`);
} else {
  console.log('\n(dry-run) usa --apply para escribir el CSV');
}
