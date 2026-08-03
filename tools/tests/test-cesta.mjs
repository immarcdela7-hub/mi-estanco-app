/* La cesta de los planes.
   No cobra —GetYourGuide no deja pagar tres actividades de una vez— y por eso
   lo que hay que vigilar no es un carrito, sino que el plan NO SE PIERDA: que
   la cuenta sea correcta, que sobreviva a irse a GetYourGuide y volver, que el
   cliente pueda desdecirse, y que abrir un plan dos veces no cuente doble.

   Va en su propia bateria porque toca localStorage: mezclarla con test-plans
   dejaria estado colgando entre pruebas. */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8099/tickets.html';

const results = [];
function log(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -- ' + detail : ''}`);
}

const browser = await chromium.launch();

/** Abre el primer plan de la rejilla, en un contexto limpio. */
async function abrirPlan(ctx, extra = '') {
  const page = await ctx.newPage();
  await page.goto(BASE + '?ref=EST-00012' + extra, { waitUntil: 'domcontentloaded' });
  await entrarEnPlanes(page);
  return page;
}

/* Las tarjetas de plan existen desde el principio pero viven dentro de la vista
   de planes, que esta oculta: hay que pulsar "Ready-made plans" ANTES de
   esperar a que se vean, o el waitFor se queda mirando elementos invisibles. */
async function entrarEnPlanes(page) {
  await page.waitForSelector('#btnPlans', { timeout: 8000 });
  await page.waitForTimeout(400);           // plans-ui.js pinta la rejilla
  await page.click('#btnPlans');
  await page.waitForSelector('.ntl-pcard', { state: 'visible', timeout: 8000 });
  await page.locator('.ntl-pcard').first().click();
  await page.waitForSelector('.ntl-step', { timeout: 5000 });
  await page.waitForTimeout(250);
}

const estado = (page) => page.evaluate(() => ({
  texto: document.querySelector('.ntl-cesta-txt b')?.textContent.trim(),
  barra: document.querySelector('.ntl-cesta-barra i')?.style.width,
  cta: document.querySelector('.ntl-cesta-go, .ntl-cesta-reset')?.textContent.trim(),
  hechos: document.querySelectorAll('.ntl-step.is-hecho').length,
  pasos: document.querySelectorAll('.ntl-step').length,
  completo: !!document.querySelector('.ntl-cesta.is-completo'),
}));

// ---------- 1. Arranca a cero y cuenta bien ----------
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const errores = [];
ctx.on('page', (p) => p.on('pageerror', (e) => errores.push(e.message)));
let page = await abrirPlan(ctx);

const cero = await estado(page);
// El plan que sale primero depende de la hora y la zona, asi que el numero de
// paradas se lee del propio detalle en vez de darlo por sabido.
const TOTAL = cero.pasos;
log('La cesta arranca a cero',
  cero.hechos === 0 && cero.texto === `0 of ${TOTAL} stops booked`, JSON.stringify(cero));
log('Y apunta a la primera parada', /stop 1/i.test(cero.cta || ''), cero.cta);

// ---------- 2. Reservar abre GetYourGuide EN OTRA PESTAÑA ----------
// Si no, el cliente pierde el plan al ir a por la primera parada, que es
// justo el problema que esto viene a resolver.
// Se mira el href, no la URL cargada: sin salida a getyourguide.com la pestaña
// se queda en chrome-error y eso diria mas del entorno que del producto.
const destino = await page.locator('.ntl-step').first().locator('.ntl-step-book')
  .getAttribute('href');
const [nueva] = await Promise.all([
  ctx.waitForEvent('page'),
  page.locator('.ntl-step').first().locator('.ntl-step-book').click(),
]);
log('Reservar abre GetYourGuide en otra pestaña, sin perder el plan',
  /getyourguide\./.test(destino || '') && !page.isClosed(), (destino || '').slice(0, 55));
log('Y el enlace conserva la atribucion',
  /cmp=EST-00012/.test(destino || '') && /partner_id=IBO5PAK/.test(destino || ''),
  (destino || '').includes('cmp=') ? 'con cmp y partner_id' : 'SIN cmp');
await nueva.close();
await page.waitForTimeout(250);

const una = await estado(page);
log('La parada queda marcada',
  una.hechos === 1 && una.texto === `1 of ${TOTAL} stops booked`, JSON.stringify(una));
log('La barra avanza', una.barra === Math.round((1 / TOTAL) * 100) + '%', una.barra);
log('Y el boton apunta ya a la siguiente', /stop 2/i.test(una.cta || ''), una.cta);

// ---------- 3. Sobrevive a recargar (que es volver de GetYourGuide) ----------
await page.reload({ waitUntil: 'domcontentloaded' });
await entrarEnPlanes(page);
const tras = await estado(page);
log('Se acuerda al volver de GetYourGuide',
  tras.hechos === 1 && tras.texto === `1 of ${TOTAL} stops booked`, JSON.stringify(tras));

// ---------- 4. El cliente puede desdecirse ----------
await page.locator('.ntl-step.is-hecho .ntl-step-deshacer').first().click();
await page.waitForTimeout(250);
const deshecho = await estado(page);
log('"Not booked yet" lo deshace',
  deshecho.hechos === 0 && deshecho.texto === `0 of ${TOTAL} stops booked`, JSON.stringify(deshecho));

// ---------- 5. Abrir el plan dos veces no cuenta doble ----------
// El oyente de la cesta se engancha una sola vez; si se enganchara en cada
// apertura, a la segunda cada clic sumaria dos paradas.
await page.evaluate(() => window.ntlPlansReset && window.ntlPlansReset());
await page.waitForTimeout(200);
await page.locator('.ntl-pcard').first().click();
await page.waitForSelector('.ntl-step', { timeout: 5000 });
await page.waitForTimeout(200);
const [n2] = await Promise.all([
  ctx.waitForEvent('page'),
  page.locator('.ntl-step').first().locator('.ntl-step-book').click(),
]);
await n2.close();
await page.waitForTimeout(250);
const doble = await estado(page);
log('Entrar y salir del plan no cuenta doble', doble.hechos === 1, JSON.stringify(doble));

// ---------- 6. Completar el plan ----------
for (let i = 0; i < 4; i++) {
  const pend = page.locator('.ntl-step:not(.is-hecho) .ntl-step-book');
  if (await pend.count() === 0) break;
  const [np] = await Promise.all([ctx.waitForEvent('page'), pend.first().click()]);
  await np.close();
  await page.waitForTimeout(220);
}
const lleno = await estado(page);
log('Con todas reservadas se da por hecho',
  lleno.completo === true && lleno.hechos === lleno.pasos && /booked/i.test(lleno.texto || ''),
  JSON.stringify(lleno));
log('La barra llega al final', lleno.barra === '100%', lleno.barra);
log('Y ofrece empezar de nuevo', /start over/i.test(lleno.cta || ''), lleno.cta);

// ---------- 7. Empezar de nuevo lo vacia ----------
await page.locator('.ntl-cesta-reset').click();
await page.waitForTimeout(300);
const vacio = await estado(page);
log('"Start over" vacia la cesta', vacio.hechos === 0 && vacio.completo === false, JSON.stringify(vacio));

// ---------- 8. Cada plan lleva su propia cuenta ----------
await page.evaluate(() => window.ntlPlansReset && window.ntlPlansReset());
await page.waitForTimeout(200);
await page.locator('.ntl-pcard').first().click();
await page.waitForSelector('.ntl-step');
const [n3] = await Promise.all([
  ctx.waitForEvent('page'),
  page.locator('.ntl-step').first().locator('.ntl-step-book').click(),
]);
await n3.close();
await page.waitForTimeout(250);
await page.evaluate(() => window.ntlPlansReset && window.ntlPlansReset());
await page.waitForTimeout(200);
await page.locator('.ntl-pcard').nth(1).click();
await page.waitForSelector('.ntl-step');
await page.waitForTimeout(250);
const otro = await estado(page);
log('Otro plan empieza limpio', otro.hechos === 0, JSON.stringify(otro));

// ---------- 9. El widget de disponibilidad no se cierra al marcar ----------
// Se repinta solo la barra, no el detalle entero: si no, marcar una parada le
// cerraria el calendario al cliente justo cuando esta eligiendo dia.
await page.evaluate(() => window.ntlPlansReset && window.ntlPlansReset());
await page.waitForTimeout(200);
await page.locator('.ntl-pcard').first().click();
await page.waitForSelector('.ntl-step');
await page.locator('.ntl-step-dates').last().click();
await page.waitForTimeout(400);
const antesAvail = await page.evaluate(() =>
  document.querySelectorAll('.ntl-step-avail:not([hidden])').length);
const [n4] = await Promise.all([
  ctx.waitForEvent('page'),
  page.locator('.ntl-step:not(.is-hecho) .ntl-step-book').first().click(),
]);
await n4.close();
await page.waitForTimeout(300);
const despuesAvail = await page.evaluate(() =>
  document.querySelectorAll('.ntl-step-avail:not([hidden])').length);
log('Marcar una parada no cierra el calendario de otra',
  antesAvail === 1 && despuesAvail === 1, `antes=${antesAvail} despues=${despuesAvail}`);

await page.close();
await ctx.close();

// ---------- 10. Sin localStorage no se rompe ----------
{
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const errs = [];
  ctx2.on('page', (p) => p.on('pageerror', (e) => errs.push(e.message)));
  const p2 = await ctx2.newPage();
  await p2.addInitScript(() => {
    // Modo privado estricto: localStorage existe pero lanza al escribir.
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { return { getItem() { throw new Error('denegado'); }, setItem() { throw new Error('denegado'); } }; },
    });
  });
  await p2.goto(BASE, { waitUntil: 'domcontentloaded' });
  await entrarEnPlanes(p2);
  const n = await p2.locator('.ntl-step').count();
  log('Sin localStorage el plan sigue funcionando', n >= 3 && errs.length === 0,
    `${n} paradas, ${errs.length} errores`);
  await ctx2.close();
}

log('Sin errores de JS', errores.length === 0, errores.slice(0, 2).join(' | ') || 'ninguno');

await browser.close();
const fallos = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - fallos.length}/${results.length} pruebas OK ===`);
if (fallos.length) {
  console.log('FALLOS:');
  fallos.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail));
  process.exitCode = 1;
}
