// Generate web/catalog.js (window.NTL_CATALOG) from web/catalog.csv.
// Run this after editing catalog.csv (adding a row = adding an activity).
//   node build-catalog.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsv } from './lib/csv.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSV = path.join(ROOT, 'web', 'catalog.csv');
const OUT = path.join(ROOT, 'web', 'catalog.js');

const PROVINCES = ['barcelona', 'tarragona', 'girona', 'lleida'];
const CATEGORIES = ['culture', 'sea', 'tours', 'food'];

const { records } = parseCsv(readFileSync(CSV, 'utf8'));

const num = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };
const warn = [];

const catalog = records.map((r, i) => {
  const provincia = (r.provincia || '').trim().toLowerCase();
  const categoria = (r.categoria || '').trim().toLowerCase();
  if (!PROVINCES.includes(provincia)) warn.push(`row ${i + 1} "${r.titulo}": unknown provincia "${provincia}"`);
  if (!CATEGORIES.includes(categoria)) warn.push(`row ${i + 1} "${r.titulo}": unknown categoria "${categoria}"`);
  if (!r.url_getyourguide) warn.push(`row ${i + 1} "${r.titulo}": missing url_getyourguide`);
  if (!/partner_id=IBO5PAK/.test(r.url_getyourguide || '')) warn.push(`row ${i + 1} "${r.titulo}": url missing partner_id=IBO5PAK`);
  if (!r.imagen) warn.push(`row ${i + 1} "${r.titulo}": missing imagen (run scrape-gyg or paste URL)`);
  return {
    order: r.order ? parseInt(r.order, 10) : i + 1,
    provincia,
    city: (r.city || provincia).trim().toLowerCase(),
    categoria,
    categoriaLabel: r.categoria_label || '',
    titulo: r.titulo || '',
    descripcion: r.descripcion || '',
    precio: num(r.precio),
    precioDisplay: r.precio_display || '',
    rating: num(r.rating),
    trending: /^s(i|í)|^y|^true|^1$/i.test((r.trending || '').trim()),
    keywords: (r.keywords || r.titulo || '').toLowerCase(),
    etiquetaPie: r.etiqueta_pie || '',
    url: r.url_getyourguide || '',
    imagen: r.imagen || '',
  };
}).sort((a, b) => a.order - b.order);

const banner = '/* AUTO-GENERATED from catalog.csv by tools/build-catalog.mjs — DO NOT EDIT BY HAND.\n' +
  `   ${catalog.length} activities. Regenerate with: node tools/build-catalog.mjs */\n`;
writeFileSync(OUT, banner + 'window.NTL_CATALOG = ' + JSON.stringify(catalog, null, 2) + ';\n', 'utf8');

console.log(`Wrote ${catalog.length} activities -> ${path.relative(ROOT, OUT)}`);
const by = (k) => catalog.reduce((a, x) => ((a[x[k]] = (a[x[k]] || 0) + 1), a), {});
console.log('by province:', by('provincia'));
console.log('by category:', by('categoria'));
console.log('with image:', catalog.filter((x) => x.imagen).length, '/', catalog.length);
if (warn.length) { console.log(`\n${warn.length} warning(s):`); warn.slice(0, 40).forEach((w) => console.log('  -', w)); }
