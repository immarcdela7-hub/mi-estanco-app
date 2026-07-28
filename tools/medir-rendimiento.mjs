// Mide lo que cuesta la pagina: tiempo hasta que se ven las tarjetas y peso
// transferido, en escritorio y en movil. Sirve para comparar antes y despues de
// crecer el catalogo.
//
//   node medir-rendimiento.mjs [etiqueta]
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8099/tickets.html?ref=PRUEBA1';
const ETIQUETA = process.argv[2] || 'sin-etiqueta';

const browser = await chromium.launch();

async function medir(nombre, viewport, isMobile) {
  const page = await browser.newPage({ viewport, isMobile, hasTouch: isMobile });
  let bytesLocal = 0, bytesExterno = 0, nLocal = 0, nExterno = 0;
  page.on('response', async (r) => {
    try {
      const buf = await r.body();
      if (r.url().includes('127.0.0.1:8099')) { bytesLocal += buf.length; nLocal++; }
      else { bytesExterno += buf.length; nExterno++; }
    } catch { /* respuestas sin cuerpo */ }
  });

  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const tDom = Date.now() - t0;
  await page.waitForSelector('.experience-item', { timeout: 30000 });
  const tPrimera = Date.now() - t0;
  await page.waitForFunction(() => {
    const n = document.querySelectorAll('.experience-item').length;
    return n > 0 && n === (window.NTL_CATALOG || []).length;
  }, { timeout: 30000 }).catch(() => {});
  const tTodas = Date.now() - t0;

  // Cuando la pagina esta quieta (sin peticiones nuevas durante 1,5 s)
  await page.waitForTimeout(3000);
  const tarjetas = await page.locator('.experience-item').count();
  const metricas = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    return {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
      load: Math.round(nav.loadEventEnd || 0),
      nodos: document.getElementsByTagName('*').length,
      imgs: document.querySelectorAll('.experience-item img').length,
    };
  });
  await page.close();
  return {
    vista: nombre, tarjetas,
    ms_dom: tDom, ms_primera_tarjeta: tPrimera, ms_todas: tTodas,
    ms_load: metricas.load, nodos: metricas.nodos, imagenes: metricas.imgs,
    kb_local: Math.round(bytesLocal / 1024), peticiones_local: nLocal,
    kb_externo: Math.round(bytesExterno / 1024), peticiones_externo: nExterno,
  };
}

const escritorio = await medir('escritorio 1280', { width: 1280, height: 900 }, false);
const movil = await medir('movil 390', { width: 390, height: 844 }, true);
await browser.close();

console.log(`\n=== ${ETIQUETA} ===`);
for (const m of [escritorio, movil]) {
  console.log(`\n${m.vista}: ${m.tarjetas} tarjetas, ${m.nodos} nodos, ${m.imagenes} imagenes`);
  console.log(`  tiempo   dom=${m.ms_dom}ms  1a tarjeta=${m.ms_primera_tarjeta}ms  todas=${m.ms_todas}ms  load=${m.ms_load}ms`);
  console.log(`  peso     local=${m.kb_local}KB (${m.peticiones_local} pet.)  externo=${m.kb_externo}KB (${m.peticiones_externo} pet.)`);
}
console.log('\nJSON:', JSON.stringify({ etiqueta: ETIQUETA, escritorio, movil }));
