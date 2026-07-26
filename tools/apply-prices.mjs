// Apply scraped prices (tools/scrape-results.json) to web/catalog.csv:
//   precio = round(real "from" price), precio_display = "from {precio}€"  (kept coherent).
// Dry-run by default (only reports). Pass --apply to write the CSV.
// Manual outlier fixes go in tools/price-overrides.json  { "<tid>": <price>, ... }.
//
//   node apply-prices.mjs           # review: shows outliers, currency issues, changes
//   node apply-prices.mjs --apply   # write catalog.csv
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseCsv, stringifyCsv } from './lib/csv.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSV = path.join(ROOT, 'web', 'catalog.csv');
const RES = path.join(ROOT, 'tools', 'scrape-results.json');
const OVR = path.join(ROOT, 'tools', 'price-overrides.json');
const APPLY = process.argv.includes('--apply');
const tidOf = (u) => (String(u).match(/-t(\d+)/) || [])[1] || '';

const results = JSON.parse(readFileSync(RES, 'utf8'));
const byTid = new Map(results.map((r) => [r.tid || tidOf(r.url), r]));
const overrides = existsSync(OVR) ? JSON.parse(readFileSync(OVR, 'utf8')) : {};
const { columns, records } = parseCsv(readFileSync(CSV, 'utf8'));

const changes = [], outliers = [], missing = [], badCurrency = [];
for (const rec of records) {
  const tid = tidOf(rec.url_getyourguide);
  const res = byTid.get(tid);
  let price = null, source = '';
  if (overrides[tid] != null) { price = Number(overrides[tid]); source = 'override'; }
  else if (res && res.chosen != null) { price = Math.round(res.chosen); source = 'scrape'; }

  if (price == null) { missing.push({ tid, titulo: rec.titulo, was: rec.precio }); continue; }
  if (res && res.currency && res.currency !== 'EUR' && source !== 'override') badCurrency.push({ tid, titulo: rec.titulo, currency: res.currency, price });
  if (price < 10 || price > 300) outliers.push({ tid, titulo: rec.titulo, price, source, json: res?.jsonPrices?.map((p) => p.v) });

  const disp = `from ${price}€`;
  if (rec.precio !== String(price) || rec.precio_display !== disp) {
    changes.push({ tid, titulo: rec.titulo, from: rec.precio, to: price, source });
    rec.precio = String(price);
    rec.precio_display = disp;
  }
}

console.log(`rows=${records.length}  changes=${changes.length}  missing(no price)=${missing.length}`);
if (badCurrency.length) { console.log(`\n!! NON-EUR currency (${badCurrency.length}) — revisar:`); badCurrency.forEach((o) => console.log(`   t${o.tid} ${o.currency} ${o.price}  ${o.titulo}`)); }
console.log(`\nOUTLIERS (<10€ o >300€) — verificar a mano contra GYG (${outliers.length}):`);
outliers.sort((a, b) => a.price - b.price).forEach((o) => console.log(`   t${o.tid}  ${o.price}€  [${o.source}] json=${JSON.stringify(o.json)}  ${o.titulo.slice(0, 42)}`));
if (missing.length) { console.log(`\nSIN PRECIO (scrape falló) (${missing.length}):`); missing.forEach((m) => console.log(`   t${m.tid} (was ${m.was})  ${m.titulo.slice(0, 42)}`)); }

if (APPLY) {
  writeFileSync(CSV, stringifyCsv(columns, records), 'utf8');
  console.log(`\nAPPLIED -> ${path.relative(ROOT, CSV)} (${changes.length} filas actualizadas)`);
} else {
  console.log('\n(dry-run) usa --apply para escribir el CSV. Correcciones manuales en tools/price-overrides.json');
}
