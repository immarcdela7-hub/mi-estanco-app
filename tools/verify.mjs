// End-to-end check of the refactored page in a real browser.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8099/tickets.html';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(BASE + '?ref=PRUEBA1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelectorAll('.experience-item').length > 0, { timeout: 10000 });

const catalogLen = await page.evaluate(() => (window.NTL_CATALOG || []).length);
const cardCount = await page.$$eval('.experience-item', (n) => n.length);

// Attribution: check the 51 CARD links specifically.
const cardLinks = await page.$$eval('a.experience-item', (as) => as.map((a) => a.href));
const cmpOk = cardLinks.filter((h) => /[?&]cmp=PRUEBA1(&|$)/.test(h)).length;
const partnerOk = cardLinks.filter((h) => /partner_id=IBO5PAK/.test(h)).length;
const utmOk = cardLinks.filter((h) => /utm_medium=local_partners/.test(h)).length;
const bad = cardLinks.filter((h) => !/partner_id=IBO5PAK/.test(h) || !/[?&]cmp=PRUEBA1(&|$)/.test(h)).slice(0, 3);

const vis = () => page.$$eval('.experience-item', (ns) => ns.filter((n) => n.style.display !== 'none').length);

await page.click('.province-btn[data-province="tarragona"]');
await page.waitForTimeout(250);
const visTarragona = await vis();

await page.click('.province-btn[data-province="girona"]');
await page.waitForTimeout(250);
const visGirona = await vis();
const emptyShown = await page.$eval('#emptyState', (e) => !e.classList.contains('hidden'));

await page.click('.province-btn[data-province="all"]');
await page.waitForTimeout(200);
const visAll = await vis();

await page.click('.filter-btn[data-filter="food"]');
await page.waitForTimeout(200);
const visFood = await vis();

// centered category bar? check computed justify-content on desktop width
const catJustify = await page.$eval('#filterContainer', (el) => getComputedStyle(el).justifyContent);

await page.click('.filter-btn[data-filter="all"]');
await page.waitForTimeout(150);
await page.screenshot({ path: 'tools/verify-tickets.png' });

// images actually load?
const imgStats = await page.$$eval('.experience-item img', (imgs) => ({
  total: imgs.length,
  loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
  cdn: imgs.filter((i) => /cdn\.getyourguide\.com/.test(i.src)).length,
}));

await browser.close();
console.log(JSON.stringify({
  catalogLen, cardCount,
  attribution: { cards: cardLinks.length, cmpOk, partnerOk, utmOk, bad },
  filters: { visAll, visTarragona, visGirona, visFood, emptyShownOnGirona: emptyShown },
  categoryJustify: catJustify,
  images: imgStats,
  consoleErrors: errors,
}, null, 2));
