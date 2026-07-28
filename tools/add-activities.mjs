// Enrich a curated list of NEW GetYourGuide activities (tools/new-activities.json)
// and append them to web/catalog.csv. Title/description/price/rating/image come from
// the activity's own og:/JSON-LD metadata (real browser, rate-limited). Province,
// city, category and footer tag are curated in new-activities.json.
//
//   node add-activities.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsv, stringifyCsv } from './lib/csv.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSV = path.join(ROOT, 'web', 'catalog.csv');
const NEW = path.join(ROOT, 'tools', 'new-activities.json');
const PROFILE = path.join(ROOT, 'tools', '.pw-profile');
const PARTNER = '?partner_id=IBO5PAK&utm_medium=local_partners';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => 6000 + Math.floor(Math.random() * 4000);

const CAT_LABEL = { culture: 'Culture', sea: 'Sea & Adventure', tours: 'Tour', food: 'Food & Nightlife' };

function cleanTitle(t) {
  return String(t || '')
    .replace(/\s*\|\s*GetYourGuide.*$/i, '')
    .replace(/\s*-\s*20\d\d\b.*$/i, '')
    .replace(/\s*\(Verified Reviews\)\s*$/i, '')
    .replace(/\s+/g, ' ').trim();
}
/* og:image viene con el preset /53.jpg, que son 180x180 y en la tarjeta se ve
   borroso. El catalogo va todo en /99.jpg (1585x792). */
function altaResolucion(url) {
  return String(url).split('?')[0].replace(/\/\d+\.jpg$/i, '/99.jpg');
}

function trimDesc(d, n = 165) {
  d = String(d || '').replace(/\s+/g, ' ').trim();
  if (d.length <= n) return d;
  const cut = d.slice(0, n);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '') + '…';
}

const { columns, records } = parseCsv(readFileSync(CSV, 'utf8'));
const haveTid = new Set(records.map((r) => (r.url_getyourguide.match(/-t(\d+)/) || [])[1]).filter(Boolean));
let order = Math.max(0, ...records.map((r) => parseInt(r.order) || 0));

const candidates = JSON.parse(readFileSync(NEW, 'utf8'));
console.log(`existing: ${records.length} rows; candidates: ${candidates.length}`);

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome', headless: false, viewport: { width: 1366, height: 900 }, locale: 'en-US',
  args: ['--disable-blink-features=AutomationControlled'],
});
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
const page = ctx.pages()[0] || (await ctx.newPage());

let added = 0, skipped = 0, failed = 0;
for (let i = 0; i < candidates.length; i++) {
  const c = candidates[i];
  const url = c.url || `https://www.getyourguide.com${c.path}`;
  const tid = (url.match(/-t(\d+)/) || [])[1];
  const tag = `[${i + 1}/${candidates.length}] t=${tid || '?'}`;
  if (tid && haveTid.has(tid)) { skipped++; console.log(`${tag} SKIP (already in catalog)`); continue; }
  try {
    const clean = url.split('?')[0];
    const resp = await page.goto(clean, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const status = resp ? resp.status() : 0;
    await page.waitForSelector('meta[property="og:image"]', { timeout: 15000 }).catch(() => {});
    const d = await page.evaluate(() => {
      const meta = (p) => document.querySelector(`meta[property="${p}"]`)?.content
        || document.querySelector(`meta[name="${p}"]`)?.content || '';
      let price = '', rating = '';
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const arr = [].concat(JSON.parse(s.textContent));
          for (const o of arr) {
            if (o?.offers?.price) price = String(o.offers.price);
            if (o?.offers?.lowPrice) price = String(o.offers.lowPrice);
            if (o?.aggregateRating?.ratingValue) rating = String(o.aggregateRating.ratingValue);
          }
        } catch {}
      }
      return { ogImage: meta('og:image'), ogTitle: meta('og:title'), ogDesc: meta('og:description'), price, rating };
    });
    if (!d.ogImage || !/getyourguide/i.test(d.ogImage)) { failed++; console.log(`${tag} NO-IMAGE status=${status}`); continue; }

    const precio = c.precio != null ? String(c.precio) : (d.price ? String(Math.round(parseFloat(d.price))) : '');
    const rating = c.rating != null ? String(c.rating) : (d.rating ? (Math.round(parseFloat(d.rating) * 10) / 10).toFixed(1) : '');
    const titulo = c.titulo || cleanTitle(d.ogTitle);
    const row = {
      order: String(++order),
      provincia: c.provincia,
      city: c.city,
      categoria: c.categoria,
      categoria_label: c.categoria_label || CAT_LABEL[c.categoria] || '',
      titulo,
      descripcion: c.descripcion || trimDesc(d.ogDesc),
      precio,
      // Mismo formato que el resto del catalogo (lo fija apply-prices.mjs).
      precio_display: c.precio_display || (precio ? `from ${precio}€` : ''),
      rating,
      trending: c.trending ? 'si' : 'no',
      keywords: (c.keywords || `${titulo} ${c.city} ${c.categoria}`).toLowerCase(),
      etiqueta_pie: c.etiqueta_pie || '',
      url_getyourguide: clean + PARTNER,
      imagen: altaResolucion(d.ogImage),
      imagen_old: '',
    };
    records.push(row);
    if (tid) haveTid.add(tid);
    added++;
    console.log(`${tag} OK  ${row.provincia}/${row.categoria}  "${titulo.slice(0, 45)}"  ${precio}€ ${rating}`);
  } catch (e) {
    failed++;
    console.log(`${tag} ERROR ${String(e.message).slice(0, 70)}`);
  }
  writeFileSync(CSV, stringifyCsv(columns, records), 'utf8');
  if (i < candidates.length - 1) await sleep(jitter());
}
await ctx.close();
console.log(`\nDONE  added=${added} skipped=${skipped} failed=${failed}  total rows now=${records.length}`);
