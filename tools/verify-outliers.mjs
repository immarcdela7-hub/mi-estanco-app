// Manually verify suspicious prices against the live GYG page: dump the visible
// headline "from" price, all € amounts on the page, and the full JSON-LD offers.
import { chromium } from 'playwright';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
// Pasa las URLs de GYG a revisar como argumentos:
//   node verify-outliers.mjs <url1> <url2> ...
const URLS = process.argv.slice(2);
if (!URLS.length) { console.log('uso: node verify-outliers.mjs <url_gyg> [url_gyg ...]'); process.exit(0); }
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'tools', '.pw-profile'), {
  channel: 'chrome', headless: false, viewport: { width: 1366, height: 900 }, locale: 'en-US',
  args: ['--disable-blink-features=AutomationControlled'],
});
const page = ctx.pages()[0] || (await ctx.newPage());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const url of URLS) {
  const tid = url.match(/-t(\d+)/)[1];
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);
    const d = await page.evaluate(() => {
      const offers = [];
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o)) return o.forEach(walk);
        if (o.offers) [].concat(o.offers).forEach((of) => { offers.push({ price: of.price, low: of.lowPrice, high: of.highPrice, cur: of.priceCurrency }); walk(of); });
        for (const k of ['@graph', 'hasVariant', 'mainEntity']) if (o[k]) walk(o[k]);
      };
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) { try { walk(JSON.parse(s.textContent)); } catch {} }
      const body = document.body.innerText || '';
      const fromM = body.match(/from[^\n€]*€?\s*[\d.,]+/i);
      const euros = [...new Set((body.match(/€\s?\d[\d.,]*/g) || []).map((s) => s.replace(/\s/g, '')))].slice(0, 12);
      return { title: document.querySelector('meta[property="og:title"]')?.content || '', from: fromM ? fromM[0].replace(/\s+/g, ' ').trim() : '', euros, offers };
    });
    console.log(`\n=== t${tid}  ${d.title.slice(0, 55)}`);
    console.log(`   visible "from": ${d.from}`);
    console.log(`   € amounts on page: ${d.euros.join('  ')}`);
    console.log(`   JSON-LD offers: ${JSON.stringify(d.offers)}`);
  } catch (e) { console.log(`t${tid} ERROR ${e.message}`); }
  await sleep(5000);
}
await ctx.close();
