/* Distintivos de las tarjetas.

   Una tarjeta solo puede llevar UNA pastilla: dos en la misma foto son ruido y,
   peor, dejan de significar nada. Aqui se comprueba que el sistema se sostiene
   con datos reales (catalog.js) y que la nuestra se distingue de las de
   GetYourGuide sin salirse de la familia.

   La ultima prueba es la que nunca puede fallar: cada actividad nueva del top 50
   tiene que salir con su `cmp`. Si un enlace lo pierde, la web parece seguir
   bien pero esa venta ya no se puede repartir al establecimiento. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8099/tickets.html';
const CRM = 'https://crm.notaxlost.com';
const ROOT = path.resolve(import.meta.dirname, '..', '..');

const results = [];
function log(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -- ' + detail : ''}`);
}

// El ranking de rank-top50.mjs es la fuente de la verdad. La pastilla se reserva
// a las 25 primeras (mismo CORTE que tools/apply-distintivos.mjs): con las 50 la
// llevaria el 40% del catalogo y dejaria de distinguir.
const CORTE = 25;
const top50 = JSON.parse(readFileSync(path.join(ROOT, 'tools', 'top50.json'), 'utf8')).top;
const TOP_TIDS = new Set(top50.slice(0, CORTE).map((x) => x.tid));
// Las que estan en el catalogo por ser del top 50 pero quedan fuera del corte:
// no pueden llevar la pastilla.
const FUERA_DE_CORTE = new Set(top50.slice(CORTE).map((x) => x.tid));

const CORS = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
const PROPIA = {
  slug: 'cata-vinos-penedes', titulo: 'Wine tasting in the Penedes',
  resumen: 'Three wines and a cellar visit', descripcion: '',
  provincia: 'barcelona', city: 'Vilafranca del Penedes', categoria: 'gastro',
  imagen: '', precio: 35, moneda: 'EUR', duracion_min: 90,
  min_personas: 2, max_personas: 8, punto_encuentro: 'Celler Can Ramon',
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errores = [];
page.on('pageerror', (e) => errores.push(e.message));
await page.route(`${CRM}/api/publico/**`, (route) => route.fulfill({
  status: 200, headers: CORS,
  body: route.request().url().includes('/actividades')
    ? JSON.stringify({ actividades: [PROPIA] }) : '{}',
}));

await page.goto(BASE + '?ref=PRUEBA1', { waitUntil: 'domcontentloaded' });
// El catalogo ya no sale como un muro de 153 fichas: por defecto se hojea por
// temas (filas) y el grid completo esta detras del boton "See all". Donde estas
// pruebas comprueban que "se ve todo", hay que pulsarlo primero.
await page.waitForSelector('.experience-item', { state: 'attached', timeout: 20000 });
await page.waitForSelector('.experience-item.ntl-own', { timeout: 8000 }).catch(() => {});

// ---------- 1. Como mucho UN distintivo por tarjeta ----------
const porTarjeta = await page.evaluate(() => {
  const out = { total: 0, conVarios: [], conUno: 0, sinNinguno: 0 };
  document.querySelectorAll('.experience-item').forEach((c) => {
    out.total++;
    const n = c.querySelectorAll('.ntl-badge').length;
    if (n > 1) out.conVarios.push((c.querySelector('h3') || {}).textContent || '?');
    else if (n === 1) out.conUno++;
    else out.sinNinguno++;
  });
  return out;
});
log('Ninguna tarjeta lleva mas de un distintivo',
  porTarjeta.conVarios.length === 0,
  `${porTarjeta.total} tarjetas, ${porTarjeta.conUno} con uno, ${porTarjeta.sinNinguno} sin ninguno` +
  (porTarjeta.conVarios.length ? ' | con varios: ' + porTarjeta.conVarios.slice(0, 3).join(', ') : ''));

// ---------- 2. El distintivo va siempre en el mismo sitio ----------
const posiciones = await page.evaluate(() => {
  const set = new Set();
  document.querySelectorAll('.experience-item .ntl-badge').forEach((b) => {
    const s = getComputedStyle(b);
    set.add([s.position, s.top, s.right].join('/'));
  });
  return [...set];
});
log('Todos los distintivos comparten posicion', posiciones.length === 1,
  posiciones.join(' | ') || 'ninguno');

// ---------- 3. Las del top 50 lo llevan y el resto no ----------
const auditoria = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.experience-item:not(.ntl-own)').forEach((c) => {
    const a = c.querySelector('a.item-link');
    const tid = a ? ((a.getAttribute('href') || '').match(/-t(\d+)/) || [])[1] : null;
    const b = c.querySelector('.ntl-badge');
    out.push({ tid, etiqueta: b ? b.textContent.trim() : '', clase: b ? b.className : '' });
  });
  return out;
});
const enTopSinEtiqueta = auditoria.filter((x) => TOP_TIDS.has(x.tid) && x.etiqueta !== "TRAVELLERS' FAVOURITE");
const fueraConEtiqueta = auditoria.filter((x) => !TOP_TIDS.has(x.tid) && x.etiqueta === "TRAVELLERS' FAVOURITE");
const conTravelers = auditoria.filter((x) => x.etiqueta === "TRAVELLERS' FAVOURITE").length;
log(`Las ${CORTE} primeras del ranking llevan TRAVELLERS' FAVOURITE`,
  enTopSinEtiqueta.length === 0,
  `${conTravelers} con la etiqueta; sin ella: ${enTopSinEtiqueta.length}`);
log('Ninguna de fuera del corte la lleva', fueraConEtiqueta.length === 0,
  fueraConEtiqueta.slice(0, 3).map((x) => 't' + x.tid).join(', ') || 'ninguna');
// Lo que de verdad hace util el corte: que el distintivo no se lo lleve todo el
// mundo. Si pasa del 30% de las tarjetas, deja de significar algo.
const proporcion = conTravelers / auditoria.length;
log('El distintivo sigue distinguiendo (menos del 30% del catalogo)',
  proporcion < 0.30, `${conTravelers}/${auditoria.length} = ${Math.round(proporcion * 100)}%`);
// Las del top 50 que quedan fuera del corte estan en el catalogo pero sin pastilla.
const fueraCorteConEtiqueta = auditoria.filter((x) => FUERA_DE_CORTE.has(x.tid) && x.etiqueta === "TRAVELLERS' FAVOURITE");
log(`Las del puesto ${CORTE + 1} al 50 estan pero sin pastilla`,
  fueraCorteConEtiqueta.length === 0,
  `${auditoria.filter((x) => FUERA_DE_CORTE.has(x.tid)).length} en el catalogo, ${fueraCorteConEtiqueta.length} con etiqueta`);

// El otro valor posible no puede colarse donde no toca.
const topPicks = auditoria.filter((x) => x.etiqueta === 'GYG TOP PICK');
log('GYG TOP PICK solo fuera del corte',
  topPicks.length > 0 && topPicks.every((x) => !TOP_TIDS.has(x.tid)),
  `${topPicks.length} con GYG TOP PICK`);

// ---------- 4. La nuestra lleva NTL EXPERIENCE ----------
const propia = await page.evaluate(() => {
  const c = document.querySelector('.experience-item.ntl-own');
  if (!c) return null;
  const b = c.querySelector('.ntl-badge');
  const pie = c.querySelector('.ntl-own-dates');
  return {
    etiqueta: b ? b.textContent.trim() : null,
    clase: b ? b.className : null,
    nBadges: c.querySelectorAll('.ntl-badge').length,
    color: b ? getComputedStyle(b).backgroundColor : null,
    pie: pie ? pie.textContent.trim() : null,
  };
});
log('La actividad propia lleva NTL EXPERIENCE',
  !!propia && propia.etiqueta === 'NTL EXPERIENCE' && propia.nBadges === 1,
  propia ? `${propia.etiqueta} (${propia.nBadges} pastilla/s)` : 'no hay tarjeta propia');
log('Y va en verde NTL', !!propia && propia.color === 'rgb(0, 200, 83)', propia ? propia.color : '-');
// El pie azul es lo que le dice al cliente que aqui si se reserva sin salir.
log('Conserva el pie "Choose a date & book here"',
  !!propia && /choose a date/i.test(propia.pie || ''), propia ? propia.pie : '-');

// ---------- 5. Atribucion: ninguna actividad se queda sin cmp ----------
// La que nunca puede fallar.
const atrib = await page.evaluate(() => {
  const as = [...document.querySelectorAll('.experience-item a[href*="getyourguide."]')];
  return {
    total: as.length,
    conCmp: as.filter((a) => /[?&]cmp=PRUEBA1(&|$)/.test(a.href)).length,
    conPartner: as.filter((a) => a.href.includes('partner_id=IBO5PAK')).length,
    sinCmp: as.filter((a) => !/[?&]cmp=PRUEBA1(&|$)/.test(a.href)).map((a) => a.href.slice(0, 80)).slice(0, 3),
  };
});
log('Todas las tarjetas de GYG llevan cmp', atrib.total > 0 && atrib.conCmp === atrib.total,
  `${atrib.conCmp}/${atrib.total}` + (atrib.sinCmp.length ? ' | sin cmp: ' + atrib.sinCmp.join(' , ') : ''));
log('Y conservan partner_id', atrib.conPartner === atrib.total, `${atrib.conPartner}/${atrib.total}`);

// Las 50 del ranking son las que mas facil se quedan fuera de la atribucion
// (24 se anadieron en la fase 1): se comprueban una por una, no solo las 25 con
// pastilla.
const nuevasTop = await page.evaluate((tids) => {
  const out = { encontradas: 0, sinCmp: [] };
  document.querySelectorAll('.experience-item:not(.ntl-own) a.item-link').forEach((a) => {
    const tid = ((a.getAttribute('href') || '').match(/-t(\d+)/) || [])[1];
    if (!tids.includes(tid)) return;
    out.encontradas++;
    if (!/[?&]cmp=PRUEBA1(&|$)/.test(a.href)) out.sinCmp.push(tid);
  });
  return out;
}, top50.map((x) => x.tid));
log('Cada una de las 50 del ranking sale con su cmp',
  nuevasTop.encontradas === 50 && nuevasTop.sinCmp.length === 0,
  `${nuevasTop.encontradas}/50 en la rejilla, ${nuevasTop.sinCmp.length} sin cmp`);

// ---------- 6. Movil 390 px: la pastilla no rompe la tarjeta ----------
const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await mob.route(`${CRM}/api/publico/**`, (route) => route.fulfill({
  status: 200, headers: CORS,
  body: route.request().url().includes('/actividades')
    ? JSON.stringify({ actividades: [PROPIA] }) : '{}',
}));
await mob.goto(BASE + '?ref=PRUEBA1', { waitUntil: 'domcontentloaded' });
await mob.waitForSelector('.experience-item', { state: 'attached', timeout: 20000 });
await mob.waitForTimeout(1200);
const movil = await mob.evaluate(() => {
  let desbordan = 0;
  document.querySelectorAll('.experience-item .ntl-badge').forEach((b) => {
    const foto = b.closest('.item-image');
    if (!foto) return;
    const rb = b.getBoundingClientRect(), rf = foto.getBoundingClientRect();
    if (rb.right > rf.right + 1 || rb.left < rf.left - 1) desbordan++;
  });
  return {
    desbordan,
    docW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  };
});
log('En movil 390px ningun distintivo se sale de su foto', movil.desbordan === 0,
  `${movil.desbordan} desbordan`);
log('Y la pagina no desborda a lo ancho', movil.docW <= movil.clientW + 1,
  `scrollW=${movil.docW} clientW=${movil.clientW}`);
await mob.close();

// ---------- 7. Sin errores ----------
log('Sin errores de JS en consola', errores.length === 0, errores.slice(0, 3).join(' | ') || 'ninguno');

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} pruebas OK ===`);
if (failed.length) { console.log('FALLOS:'); failed.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail)); }
