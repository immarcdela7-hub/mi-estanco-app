// Widgets de GetYourGuide inyectados por JS: ¿montan de verdad?
//
// El script de GYG (pa.umd.production.min.js) se carga async y, segun su
// documentacion, escanea los data-gyg-href de la pagina. La duda razonable era
// si veria los divs que inyectamos DESPUES (el de disponibilidad de cada parada
// y el de ciudad perezoso). Verificado en navegador real: si los detecta, asi
// que no hace falta re-inyectar su <script> ni forzar un re-escaneo — algo que
// ademas duplicaria los widgets ya montados.
//
// Lo que se comprueba aqui es lo que no se ve leyendo el codigo:
//  1. el widget de disponibilidad monta al inyectarlo (y no salta el fallback),
//  2. la URL del iframe lleva cmp + partner_id  <-- lo critico: sin cmp no hay
//     atribucion al establecimiento y la venta no se puede repartir,
//  3. los widgets de ciudad no se acumulan ni se duplican,
//  4. la red de seguridad: si GYG esta caido o bloqueado, el hueco se sustituye
//     por un enlace normal a la actividad, tambien con cmp + partner_id.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8099/tickets.html';
const browser = await chromium.launch();
const results = [];
function log(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -- ' + detail : ''}`);
}

// Abre la vista de planes y entra en el primer plan.
async function abrirPrimerPlan(page) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, a')]
      .find((e) => /ready-?made plans/i.test(e.textContent || ''));
    if (b) b.click();
  });
  await page.waitForSelector('.ntl-pcard', { timeout: 10000 });
  await page.click('.ntl-pcard');
  await page.waitForSelector('.ntl-step-dates', { timeout: 10000 });
}

// Pulsa "Check dates & live price" de la parada `i` y espera el iframe.
async function abrirDisponibilidad(page, i = 0) {
  const btns = await page.$$('.ntl-step-dates');
  if (!btns[i]) return { ms: null, mounted: false };
  const t0 = Date.now();
  await btns[i].click();
  let ms = null;
  try {
    await page.waitForSelector('.ntl-step-avail:not([hidden]) iframe', { timeout: 10000 });
    ms = Date.now() - t0;
  } catch { /* no monto: lo evalua quien llama */ }
  return { ms, mounted: ms !== null };
}

// ---------- 1. El widget de disponibilidad monta al inyectarlo ----------
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errores = [];
page.on('pageerror', (e) => errores.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });

await page.goto(BASE + '?ref=PRUEBA1', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.experience-item', { timeout: 20000 });
// El script de GYG es async: sin el no hay widget que valga.
await page.waitForFunction(() => typeof window.GYG !== 'undefined', { timeout: 20000 }).catch(() => {});

const gygApi = await page.evaluate(() => ({
  cargado: typeof window.GYG !== 'undefined',
  refresh: typeof (window.GYG || {}).refresh,
}));
log('El script de GYG carga y expone su API', gygApi.cargado, `GYG.refresh=${gygApi.refresh}`);

await abrirPrimerPlan(page);
const primera = await abrirDisponibilidad(page, 0);
log('El widget de disponibilidad monta al inyectarlo', primera.mounted,
  primera.mounted ? `iframe en ${primera.ms} ms` : 'no aparecio el iframe');

// El fallback es la red de seguridad, no el camino normal: si salta con GYG
// disponible es que el widget no monto.
const sinFallback = await page.evaluate(() =>
  !document.querySelector('.ntl-step-avail:not([hidden]) .ntl-avail-fallback'));
log('Con GYG disponible no salta el fallback', sinFallback,
  sinFallback ? 'monto el widget' : 'salto el enlace de emergencia');

// ---------- 2. El iframe lleva cmp + partner_id (lo critico) ----------
const src = await page.evaluate(() => {
  const f = document.querySelector('.ntl-step-avail:not([hidden]) iframe');
  return f ? f.src : null;
});
log('La URL del iframe lleva cmp=PRUEBA1', !!src && /[?&]cmp=PRUEBA1(&|$)/.test(src),
  src ? src.slice(0, 110) + '…' : 'sin iframe');
log('La URL del iframe conserva partner_id=IBO5PAK', !!src && /partner_id=IBO5PAK/.test(src),
  src ? (src.match(/partner_id=[^&]*/) || [''])[0] : 'sin iframe');

// Otra parada distinta: el tour_id debe cambiar y el cmp mantenerse.
const btns = await page.$$('.ntl-step-dates');
let otra = { ok: false, detalle: 'solo hay una parada con widget' };
if (btns.length > 1) {
  const r = await abrirDisponibilidad(page, 1);
  const info = await page.evaluate(() => {
    const f = document.querySelector('.ntl-step-avail:not([hidden]) iframe');
    return f ? { tour: (f.src.match(/tour_id=(\d+)/) || [])[1], cmp: /[?&]cmp=PRUEBA1(&|$)/.test(f.src) } : null;
  });
  otra = { ok: !!(r.mounted && info && info.cmp), detalle: info ? `tour_id=${info.tour}, cmp=${info.cmp}` : 'sin iframe' };
}
log('Otra parada tambien monta y mantiene el cmp', otra.ok, otra.detalle);

// Abrir uno cierra el anterior: son iframes pesados (~600 KB).
const abiertos = await page.evaluate(() =>
  document.querySelectorAll('.ntl-step-avail:not([hidden]) iframe').length);
log('Solo hay un widget de disponibilidad abierto a la vez', abiertos === 1, `${abiertos} abiertos`);

// Cerrar y volver a abrir la MISMA parada debe volver a montar. Hay que
// asegurarse de que primero queda cerrada: el boton es un toggle.
const btns2 = await page.$$('.ntl-step-dates');
await btns2[0].click();                       // abre la 0 (estaba abierta la 1)
await page.waitForTimeout(500);
await btns2[0].click();                       // toggle: la cierra
await page.waitForFunction(() => !document.querySelector('.ntl-step-avail:not([hidden])'), { timeout: 5000 })
  .catch(() => {});
const reabre = await abrirDisponibilidad(page, 0);
log('Cerrar y reabrir vuelve a montar el widget', reabre.mounted,
  reabre.mounted ? `iframe en ${reabre.ms} ms` : 'no volvio a montar');

// ---------- 3. Los widgets de ciudad no se duplican ----------
// Se monta uno solo y de forma perezosa; ni el trasiego de planes ni abrir
// disponibilidad deben dejar widgets de ciudad de mas.
// Volver al catalogo por donde vuelve el usuario: la flecha de la cabecera.
// Es contextual, asi que desde el detalle hay que pulsarla dos veces (detalle
// -> lista de planes -> catalogo).
for (let i = 0; i < 2; i++) {
  const visible = await page.evaluate(() => {
    const el = document.getElementById('discoverMore');
    return !!(el && el.offsetParent !== null);
  });
  if (visible) break;
  await page.click('#hdBack');
  await page.waitForTimeout(500);
}
await page.waitForFunction(() => {
  const el = document.getElementById('discoverMore');
  return el && el.offsetParent !== null;
}, { timeout: 8000 }).catch(() => {});
await page.evaluate(() => document.getElementById('discoverMore').scrollIntoView());
await page.waitForFunction(() => document.querySelectorAll('#cityWidgetBox [data-gyg-widget]').length > 0,
  { timeout: 8000 }).catch(() => {});
const ciudad = await page.evaluate(() => ({
  divs: document.querySelectorAll('#cityWidgetBox [data-gyg-widget]').length,
  iframes: document.querySelectorAll('#cityWidgetBox iframe').length,
}));
log('Tras usar los planes sigue habiendo un solo widget de ciudad',
  ciudad.divs === 1 && ciudad.iframes <= 1, JSON.stringify(ciudad));

// Cambiar de provincia varias veces tampoco debe acumular.
for (const prov of ['girona', 'lleida', 'barcelona', 'tarragona', 'barcelona']) {
  await page.click(`button.province-btn[data-province="${prov}"]`);
  await page.waitForTimeout(220);
}
await page.waitForTimeout(600);
const trasCambios = await page.evaluate(() => ({
  divs: document.querySelectorAll('#cityWidgetBox [data-gyg-widget]').length,
  iframes: document.querySelectorAll('#cityWidgetBox iframe').length,
  loc: (document.querySelector('#cityWidgetBox [data-gyg-widget]') || {}).dataset?.gygLocationId || null,
}));
log('Cambiar de provincia no acumula widgets de ciudad',
  trasCambios.divs === 1 && trasCambios.iframes <= 1 && trasCambios.loc === '45',
  JSON.stringify(trasCambios));

const erroresReales = errores.filter((e) => !/cdn\.getyourguide|widget\.getyourguide|ERR_|net::/i.test(e));
log('Sin errores de JS en consola', erroresReales.length === 0,
  erroresReales.slice(0, 3).join(' | ') || 'ninguno');
await page.close();

// ---------- 4. Red de seguridad: GYG bloqueado ----------
// Reproduce el entorno donde widget.getyourguide.com no es accesible: a los
// 3,5 s el hueco debe convertirse en un enlace normal a la actividad, y ese
// enlace tiene que conservar la atribucion.
const blocked = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const erroresBloqueo = [];
blocked.on('pageerror', (e) => erroresBloqueo.push('PAGEERROR: ' + e.message));
// Se responde vacio en vez de abortar: asi se simula "GYG no disponible" sin
// dejar colgada la carga de la pagina (un abort del <script> la bloquea).
await blocked.route('**widget.getyourguide.com/**', (route) =>
  route.fulfill({ status: 204, body: '', contentType: 'application/javascript' }));
await blocked.goto(BASE + '?ref=PRUEBA1', { waitUntil: 'domcontentloaded' });
await blocked.waitForSelector('.experience-item', { timeout: 20000 });
await abrirPrimerPlan(blocked);
await blocked.click('.ntl-step-dates');
await blocked.waitForTimeout(4500);            // deja pasar el timeout de 3,5 s

const rescate = await blocked.evaluate(() => {
  const box = document.querySelector('.ntl-step-avail:not([hidden])');
  const a = box && box.querySelector('.ntl-avail-fallback');
  return {
    hayEnlace: !!a,
    href: a ? a.href : null,
    cmp: a ? /[?&]cmp=PRUEBA1(&|$)/.test(a.href) : false,
    partner: a ? /partner_id=IBO5PAK/.test(a.href) : false,
    huecoVacio: !!box && !box.querySelector('iframe') && !a,
  };
});
log('Con GYG bloqueado salta el enlace de rescate', rescate.hayEnlace,
  rescate.href ? rescate.href.slice(0, 95) + '…' : 'no aparecio');
log('El enlace de rescate conserva cmp y partner_id', rescate.cmp && rescate.partner,
  `cmp=${rescate.cmp}, partner_id=${rescate.partner}`);
log('El cliente nunca ve un hueco roto', !rescate.huecoVacio,
  rescate.huecoVacio ? 'la caja quedo vacia' : 'siempre hay widget o enlace');

// El catalogo debe seguir funcionando aunque GYG no cargue.
const catalogoOk = await blocked.evaluate(() => {
  const as = [...document.querySelectorAll('a[href*="getyourguide."]')];
  return { total: as.length, conCmp: as.filter((a) => a.href.includes('cmp=PRUEBA1')).length };
});
log('Con GYG bloqueado la web sigue atribuyendo',
  catalogoOk.total > 0 && catalogoOk.conCmp === catalogoOk.total && erroresBloqueo.length === 0,
  `${catalogoOk.conCmp}/${catalogoOk.total} enlaces con cmp`);
await blocked.close();

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} pruebas OK ===`);
if (failed.length) { console.log('FALLOS:'); failed.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail)); }
