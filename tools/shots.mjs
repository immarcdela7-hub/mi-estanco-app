import { chromium } from 'playwright';
const BASE = 'http://localhost:8099/tickets.html';
const b = await chromium.launch({ channel: 'chrome', headless: true });

// Desktop
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto(BASE + '?ref=PRUEBA1', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelectorAll('.experience-item').length > 0);
await p.waitForTimeout(1200);
await p.screenshot({ path: 'shot-desktop-top.png' });

await p.click('.province-btn[data-province="girona"]');
await p.waitForTimeout(400);
await p.evaluate(() => window.scrollTo(0, 380));
await p.waitForTimeout(1000);
await p.screenshot({ path: 'shot-girona.png' });

await p.click('.province-btn[data-province="all"]');
await p.click('.filter-btn[data-filter="food"]');
await p.waitForTimeout(400);
await p.evaluate(() => window.scrollTo(0, 380));
await p.waitForTimeout(1000);
await p.screenshot({ path: 'shot-nightlife.png' });

// Mobile
const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await m.goto(BASE, { waitUntil: 'domcontentloaded' });
await m.waitForFunction(() => document.querySelectorAll('.experience-item').length > 0);
await m.waitForTimeout(1200);
await m.screenshot({ path: 'shot-mobile.png' });

await b.close();
console.log('shots saved');
