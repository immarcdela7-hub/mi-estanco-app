// Harvest REAL GetYourGuide activity URLs from location/category listing pages,
// using the real headed Chrome. We only collect the activity URLs (+ tid + location
// slug); full metadata (title/price/rating/image) is fetched later per-activity.
// Rate-limited: a handful of page loads with human pauses.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'tools', 'harvest.json');
const PROFILE = path.join(ROOT, 'tools', '.pw-profile');

// Listing pages to harvest. locHint helps province assignment during curation.
const LISTINGS = [
  { url: 'https://www.getyourguide.com/barcelona-l45/pub-crawls-bar-tours-tc110/', tag: 'bcn-nightlife' },
  { url: 'https://www.getyourguide.com/catalonia-l641/clubbing-nightlife-tours-tc2161/', tag: 'cat-nightlife' },
  { url: 'https://www.getyourguide.com/girona-l550/', tag: 'girona' },
  { url: 'https://www.getyourguide.com/lloret-de-mar-l2322/', tag: 'lloret' },
  { url: 'https://www.getyourguide.com/tossa-de-mar-l90930/', tag: 'tossa' },
  { url: 'https://www.getyourguide.com/costa-brava-l473/', tag: 'costabrava' },
  { url: 'https://www.getyourguide.com/figueres-l4082/', tag: 'figueres' },
  { url: 'https://www.getyourguide.com/vielha-l218675/', tag: 'vielha' },
  { url: 'https://www.getyourguide.com/val-d-aran-l218677/', tag: 'valdaran' },
  { url: 'https://www.getyourguide.com/la-seu-d-urgell-l169740/', tag: 'seudurgell' },
  { url: 'https://www.getyourguide.com/tarragona-l2419/', tag: 'tarragona' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome', headless: false, viewport: { width: 1366, height: 900 }, locale: 'en-US',
  args: ['--disable-blink-features=AutomationControlled'],
});
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
const page = ctx.pages()[0] || (await ctx.newPage());

const all = {};
for (let i = 0; i < LISTINGS.length; i++) {
  const { url, tag } = LISTINGS[i];
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const status = resp ? resp.status() : 0;
    // Let lazy content load: scroll down a few times.
    for (let s = 0; s < 5; s++) { await page.mouse.wheel(0, 2200); await sleep(700); }
    const items = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('a[href*="-t"]').forEach((a) => {
        const m = a.getAttribute('href')?.match(/\/([a-z0-9-]+-l\d+)\/([a-z0-9-]+-t(\d+))\/?/i);
        if (!m) return;
        out.push({
          loc: m[1], slug: m[2], tid: m[3],
          path: `/${m[1]}/${m[2]}/`,
          label: (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        });
      });
      return out;
    });
    let added = 0;
    for (const it of items) {
      if (!all[it.tid]) { all[it.tid] = { ...it, tag }; added++; }
    }
    console.log(`[${i + 1}/${LISTINGS.length}] ${tag} status=${status} found=${items.length} new=${added}`);
  } catch (e) {
    console.log(`[${i + 1}/${LISTINGS.length}] ${tag} ERROR ${String(e.message).slice(0, 80)}`);
  }
  writeFileSync(OUT, JSON.stringify(Object.values(all), null, 2), 'utf8');
  if (i < LISTINGS.length - 1) await sleep(5000 + Math.random() * 4000);
}
await ctx.close();
const arr = Object.values(all);
console.log(`\nHarvested ${arr.length} unique activities -> ${path.relative(ROOT, OUT)}`);
const byTag = arr.reduce((a, x) => ((a[x.tag] = (a[x.tag] || 0) + 1), a), {});
console.log('by tag:', byTag);
