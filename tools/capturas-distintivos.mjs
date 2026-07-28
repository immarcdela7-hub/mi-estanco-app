// Capturas de la rejilla con los tres distintivos, en escritorio y en movil de
// 390 px. El CRM se simula (como en las pruebas) para que salga tambien la
// tarjeta propia con su NTL EXPERIENCE.
//
// En la rejilla real las tres pastillas caen muy separadas (la propia se ordena
// al final de su provincia y los GYG TOP PICK estan repartidos), asi que no hay
// un encuadre honesto que las junte: se hace una captura por distintivo y se
// comprueba que cada una lo contiene de verdad.
//
//   node capturas-distintivos.mjs
import { chromium } from 'playwright';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8099/tickets.html?ref=PRUEBA1';
const CRM = 'https://crm.notaxlost.com';
const OUT = path.resolve(import.meta.dirname, 'capturas');
const CORS = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };

const PROPIA = {
  slug: 'cata-vinos-penedes', titulo: 'Wine tasting in the Penedes',
  resumen: 'Three wines and a cellar visit, with the winemaker',
  provincia: 'barcelona', city: 'Vilafranca del Penedes', categoria: 'gastro',
  imagen: 'https://cdn.getyourguide.com/img/tour/5cf2c9b0e4a55.jpeg/99.jpg',
  precio: 35, moneda: 'EUR', duracion_min: 90, min_personas: 2, max_personas: 8,
  punto_encuentro: 'Celler Can Ramon',
};

const TIPOS = [
  ['travelers', 'ntl-badge-travelers', "TRAVELLERS' FAVOURITE"],
  ['toppick', 'ntl-badge-toppick', 'GYG TOP PICK'],
  ['ntl', 'ntl-badge-own', 'NTL EXPERIENCE'],
];

const browser = await chromium.launch({ channel: 'chrome' });

async function preparar(page) {
  await page.route(`${CRM}/api/publico/**`, (route) => route.fulfill({
    status: 200, headers: CORS,
    body: route.request().url().includes('/actividades')
      ? JSON.stringify({ actividades: [PROPIA] }) : '{}',
  }));
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.experience-item', { timeout: 30000 });
  await page.waitForSelector('.experience-item.ntl-own', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

async function capturar(page, etiqueta, margen) {
  for (const [nombre, clase, texto] of TIPOS) {
    const y = await page.evaluate((c) => {
      const b = document.querySelector(`.experience-item .ntl-badge.${c}`);
      if (!b) return null;
      return b.closest('.experience-item').getBoundingClientRect().top + scrollY;
    }, clase);
    if (y == null) { console.log(`  ${etiqueta}/${nombre}: NO HAY ninguna tarjeta con ese distintivo`); continue; }
    await page.evaluate((yy) => scrollTo({ top: Math.max(0, yy) }), y - margen);
    await page.waitForTimeout(2200);   // que carguen las fotos de esa franja
    const fichero = path.join(OUT, `distintivo-${nombre}-${etiqueta}.png`);
    await page.screenshot({ path: fichero });
    const visible = await page.evaluate((c) => {
      const b = document.querySelector(`.experience-item .ntl-badge.${c}`);
      if (!b) return false;
      const r = b.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight && r.width > 0;
    }, clase);
    console.log(`  ${etiqueta}/${nombre}: ${visible ? 'OK' : 'FUERA DE PANTALLA'}  "${texto}"  -> ${path.basename(fichero)}`);
  }
}

const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await preparar(page);
console.log('escritorio 1280:');
await capturar(page, 'escritorio', 120);
await page.close();

const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await preparar(mob);
console.log('movil 390:');
await capturar(mob, 'movil', 80);
await mob.close();

await browser.close();
console.log('\ncapturas en', OUT);
