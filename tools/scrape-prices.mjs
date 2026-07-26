// Scrape the real "from" (lowest) price for every activity in web/catalog.csv using
// a REAL headed Chrome (Playwright). Prices come from each activity's JSON-LD offers
// (lowPrice / price across all offers -> the minimum is the "from" price), with a
// visible-price cross-check. Writes tools/scrape-results.json. Does NOT touch the CSV
// (apply-prices.mjs does that, so outliers can be reviewed first).
//
//   node scrape-prices.mjs            # scrape all 101
//   node scrape-prices.mjs --missing  # only rows without a result yet
//   node scrape-prices.mjs --limit=N  # first N (smoke test)
//   node scrape-prices.mjs --headless # no visible window (more blockable)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseCsv } from './lib/csv.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSV = path.join(ROOT, 'web', 'catalog.csv');
const OUT = path.join(ROOT, 'tools', 'scrape-results.json');
const PROFILE = path.join(ROOT, 'tools', '.pw-profile');

const MISSING = process.argv.includes('--missing');
const HEADLESS = process.argv.includes('--headless');
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith('--limit=')); return a ? parseInt(a.split('=')[1]) : Infinity; })();
const MIN_DELAY = 6000, MAX_DELAY = 10000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => MIN_DELAY + Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY));
const tidOf = (u) => (String(u).match(/-t(\d+)/) || [])[1] || '';

const { records } = parseCsv(readFileSync(CSV, 'utf8'));
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
const byTid = new Map(prev.map((r) => [r.tid || tidOf(r.url), r]));

let targets = records.filter((r) => r.url_getyourguide);
if (MISSING) targets = targets.filter((r) => { const p = byTid.get(tidOf(r.url_getyourguide)); return !p || p.chosen == null; });
targets = targets.slice(0, LIMIT);
console.log(`catalog: ${records.length}; to scrape: ${targets.length}${MISSING ? ' (missing only)' : ''}`);
if (!targets.length) { console.log('nothing to do'); process.exit(0); }

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome', headless: HEADLESS, viewport: { width: 1366, height: 900 }, locale: 'en-US',
  args: ['--disable-blink-features=AutomationControlled'],
});
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
const page = ctx.pages()[0] || (await ctx.newPage());

let ok = 0, fail = 0;
for (let i = 0; i < targets.length; i++) {
  const r = targets[i];
  const tid = tidOf(r.url_getyourguide);
  const clean = r.url_getyourguide.split('?')[0];
  const tag = `[${i + 1}/${targets.length}] t=${tid}`;
  try {
    const resp = await page.goto(clean, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const status = resp ? resp.status() : 0;
    await page.waitForSelector('script[type="application/ld+json"]', { timeout: 15000 }).catch(() => {});
    const d = await page.evaluate(() => {
      const prices = []; let currency = '';
      const pushOffer = (o) => {
        if (!o || typeof o !== 'object') return;
        if (o.lowPrice != null && !isNaN(parseFloat(o.lowPrice))) prices.push({ v: parseFloat(o.lowPrice), src: 'lowPrice' });
        if (o.price != null && !isNaN(parseFloat(o.price))) prices.push({ v: parseFloat(o.price), src: 'price' });
        if (o.priceCurrency) currency = o.priceCurrency;
      };
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o)) return o.forEach(walk);
        if (o.offers) [].concat(o.offers).forEach((of) => { pushOffer(of); walk(of); });
        for (const k of ['@graph', 'itemListElement', 'hasVariant', 'mainEntity']) if (o[k]) walk(o[k]);
      };
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        try { walk(JSON.parse(s.textContent)); } catch {}
      }
      const body = document.body ? document.body.innerText : '';
      const m = body.match(/from\s*€?\s*([\d]+(?:[.,]\d+)?)/i);
      const visible = m ? parseFloat(m[1].replace(',', '.')) : null;
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
      return { prices, currency, visible, ogTitle };
    });
    const nums = d.prices.map((p) => p.v).filter((v) => v > 0);
    const chosen = nums.length ? Math.min(...nums) : (d.visible || null); // "from" = lowest offer
    const rec = {
      tid, url: r.url_getyourguide, title: r.titulo || d.ogTitle, status,
      chosen, currency: d.currency || '', visible: d.visible,
      jsonPrices: d.prices, prevPrecio: r.precio,
    };
    byTid.set(tid, rec);
    if (chosen != null) { ok++; console.log(`${tag} OK ${status}  from=${chosen}${d.currency ? ' ' + d.currency : ''}  (was ${r.precio})  ${(r.titulo || '').slice(0, 34)}`); }
    else { fail++; console.log(`${tag} NO-PRICE ${status}  ${(r.titulo || '').slice(0, 40)}`); }
  } catch (e) {
    fail++;
    byTid.set(tid, { tid, url: r.url_getyourguide, error: String(e.message).slice(0, 120), prevPrecio: r.precio });
    console.log(`${tag} ERROR ${String(e.message).slice(0, 70)}`);
  }
  writeFileSync(OUT, JSON.stringify([...byTid.values()], null, 2), 'utf8');
  if (i < targets.length - 1) await sleep(jitter());
}
await ctx.close();
console.log(`\nDONE ok=${ok} fail=${fail} -> ${path.relative(ROOT, OUT)}`);
const cur = [...new Set([...byTid.values()].map((x) => x.currency).filter(Boolean))];
console.log('currencies seen:', cur);
