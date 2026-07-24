// Scrape the main photo (og:image) for each GetYourGuide activity in web/catalog.csv,
// using a REAL headed Chrome (Playwright, channel:chrome). GYG returns 403 to
// non-browser requests, so a real browser is required. Rate-limited (few per minute)
// to avoid being blocked. Fills the `imagen` column with the cdn.getyourguide.com URL.
//
//   node scrape-gyg.mjs            # only rows with empty imagen
//   node scrape-gyg.mjs --all      # re-scrape every row
//   node scrape-gyg.mjs --headless # run without a visible window (more blockable)
//
// Plan B if a row fails: paste the image URL by hand into catalog.csv (right-click
// the photo on GYG -> Copy image address), then re-run to fill the rest.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsv, stringifyCsv } from './lib/csv.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSV = path.join(ROOT, 'web', 'catalog.csv');
const LOG = path.join(ROOT, 'tools', 'scrape-results.json');
const PROFILE = path.join(ROOT, 'tools', '.pw-profile');

const ALL = process.argv.includes('--all');
const HEADLESS = process.argv.includes('--headless');
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith('--limit=')); return a ? parseInt(a.split('=')[1]) : Infinity; })();
const MIN_DELAY = 6000, MAX_DELAY = 10000; // ms between activities: "pocas por minuto"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => MIN_DELAY + Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY));

const { columns, records } = parseCsv(readFileSync(CSV, 'utf8'));
const targets = records.filter((r) => r.url_getyourguide && (ALL || !r.imagen)).slice(0, LIMIT);
console.log(`catalog: ${records.length} rows; to scrape: ${targets.length} (${ALL ? 'all' : 'missing images only'})`);
if (!targets.length) { console.log('nothing to do'); process.exit(0); }

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome',
  headless: HEADLESS,
  viewport: { width: 1366, height: 900 },
  locale: 'en-US',
  args: ['--disable-blink-features=AutomationControlled'],
});
// Light webdriver evasion (GYG bot checks).
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
const page = ctx.pages()[0] || (await ctx.newPage());

const results = [];
let ok = 0, fail = 0;
for (let i = 0; i < targets.length; i++) {
  const r = targets[i];
  const label = `[${i + 1}/${targets.length}] t=${(r.url_getyourguide.match(/-t(\d+)/) || [])[1] || '?'}`;
  try {
    const resp = await page.goto(r.url_getyourguide, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const status = resp ? resp.status() : 0;
    // og:image lives in <head>; wait briefly for it.
    await page.waitForSelector('meta[property="og:image"]', { timeout: 15000 }).catch(() => {});
    const data = await page.evaluate(() => {
      const meta = (p) => document.querySelector(`meta[property="${p}"]`)?.content
        || document.querySelector(`meta[name="${p}"]`)?.content || '';
      let price = '', rating = '', jsonTitle = '';
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const j = JSON.parse(s.textContent);
          const arr = Array.isArray(j) ? j : [j];
          for (const o of arr) {
            if (o?.offers?.price) price = String(o.offers.price);
            if (o?.offers?.lowPrice) price = String(o.offers.lowPrice);
            if (o?.aggregateRating?.ratingValue) rating = String(o.aggregateRating.ratingValue);
            if (o?.name && !jsonTitle) jsonTitle = String(o.name);
          }
        } catch {}
      }
      return { ogImage: meta('og:image'), ogTitle: meta('og:title'), price, rating, jsonTitle };
    });
    if (data.ogImage && /getyourguide/i.test(data.ogImage)) {
      r.imagen = data.ogImage.split('?')[0]; // clean CDN url, hotlinked
      ok++;
      console.log(`${label} OK ${status}  ${r.imagen}`);
    } else {
      fail++;
      console.log(`${label} NO-IMAGE ${status}  title="${data.ogTitle?.slice(0, 40)}"`);
    }
    results.push({ url: r.url_getyourguide, status, ...data, imagen: r.imagen });
  } catch (e) {
    fail++;
    console.log(`${label} ERROR ${e.message?.slice(0, 80)}`);
    results.push({ url: r.url_getyourguide, error: String(e.message || e) });
  }
  // Persist progress after every activity so a crash never loses work.
  writeFileSync(CSV, stringifyCsv(columns, records), 'utf8');
  writeFileSync(LOG, JSON.stringify(results, null, 2), 'utf8');
  if (i < targets.length - 1) await sleep(jitter());
}

await ctx.close();
console.log(`\nDONE  ok=${ok}  fail=${fail}  -> ${path.relative(ROOT, CSV)}`);
if (fail) console.log('Failures need Plan B (manual image URL paste). See tools/scrape-results.json');
