// Extract the current catalog from the ORIGINAL tickets.html into web/catalog.csv.
// Uses a real DOM (Playwright + installed Chrome) so we copy the structure exactly
// instead of inventing it. One-time migration; safe to re-run.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'tools', 'reference', 'tickets-original.html');
const OUT = path.join(ROOT, 'web', 'catalog.csv');

// City -> province (the 4 Catalan provinces the site filters by).
const CITY_TO_PROVINCE = {
  barcelona: 'barcelona',
  salou: 'tarragona',
  cambrils: 'tarragona',
  // Costa Daurada towns live in Tarragona; Costa Brava tours that DEPART Barcelona stay 'barcelona'.
};

const COLUMNS = [
  'order', 'provincia', 'city', 'categoria', 'categoria_label',
  'titulo', 'descripcion', 'precio', 'precio_display', 'rating',
  'trending', 'keywords', 'etiqueta_pie', 'url_getyourguide', 'imagen', 'imagen_old',
];

function csvCell(v) {
  const s = (v ?? '').toString();
  return '"' + s.replace(/"/g, '""') + '"';
}
function toCsv(rows) {
  const lines = [COLUMNS.map(csvCell).join(',')];
  for (const r of rows) lines.push(COLUMNS.map((c) => csvCell(r[c])).join(','));
  return lines.join('\n') + '\n';
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto(pathToFileURL(SRC).href, { waitUntil: 'domcontentloaded' });

const cards = await page.$$eval('.experience-item', (nodes) => {
  const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  return nodes.map((card) => {
    const trending = Array.from(card.querySelectorAll('div')).some(
      (d) => d.textContent.trim().toLowerCase() === 'trending'
    );
    return {
      order: card.getAttribute('data-order') || '',
      city: card.getAttribute('data-city') || '',
      categoria: card.getAttribute('data-category') || '',
      keywords: card.getAttribute('data-name') || '',
      precio: card.getAttribute('data-price') || '',
      rating: card.getAttribute('data-rating') || '',
      url: card.getAttribute('href') || '',
      imagen_old: card.querySelector('img')?.getAttribute('src') || '',
      categoria_label: txt(card.querySelector('.category-tag')),
      titulo: txt(card.querySelector('h3')),
      descripcion: txt(card.querySelector('.item-description')),
      etiqueta_pie: txt(card.querySelector('.footer-tag')),
      precio_display: txt(card.querySelector('.price-tag')),
      trending: trending ? 'si' : 'no',
    };
  });
});

await browser.close();

const rows = cards.map((c) => ({
  order: c.order,
  provincia: CITY_TO_PROVINCE[c.city] || c.city,
  city: c.city,
  categoria: c.categoria,
  categoria_label: c.categoria_label,
  titulo: c.titulo,
  descripcion: c.descripcion,
  precio: c.precio,
  precio_display: c.precio_display,
  rating: c.rating,
  trending: c.trending,
  keywords: c.keywords,
  etiqueta_pie: c.etiqueta_pie,
  url_getyourguide: c.url,
  imagen: '', // filled by scrape-gyg.mjs (og:image from cdn.getyourguide.com)
  imagen_old: c.imagen_old,
}));

writeFileSync(OUT, toCsv(rows), 'utf8');
console.log(`Extracted ${rows.length} activities -> ${path.relative(ROOT, OUT)}`);
const byProv = rows.reduce((a, r) => ((a[r.provincia] = (a[r.provincia] || 0) + 1), a), {});
const byCat = rows.reduce((a, r) => ((a[r.categoria] = (a[r.categoria] || 0) + 1), a), {});
console.log('by province:', byProv);
console.log('by category:', byCat);
