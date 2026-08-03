/* Reservar un plan entero de una vez.
   Esto es lo que con GetYourGuide no se puede hacer: sus enlaces venden una
   actividad cada uno. Con las nuestras si, y lo que hay que vigilar es que sea
   DE VERDAD una sola operacion —un envio, un localizador, todo o nada— y que
   la web no mienta sobre cuales entran en la cesta y cuales no.

   El CRM se simula con page.route: la atomicidad de verdad vive en la
   transaccion serializable del servidor y se comprueba contra Postgres (ver
   README), aqui se comprueba lo que ve el cliente. */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8099/tickets.html';
const CRM = 'https://crm.notaxlost.com';
const PLAN = 'Penedès';

const results = [];
function log(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -- ' + detail : ''}`);
}

const dia = (n) => new Date(Date.UTC(2026, 7, 4) + n * 86400000).toISOString().slice(0, 10);

const ACTIVIDADES = [
  {
    slug: 'cata-vinos-penedes', titulo: 'Wine tasting in the Penedes',
    resumen: 'Three wines and a cellar visit', provincia: 'barcelona',
    city: 'Vilafranca del Penedes', categoria: 'gastro', imagen: '',
    precio: 35, duracion_min: 90, min_personas: 1, max_personas: 8,
    punto_encuentro: 'Celler Can Ramon', horas: ['11:00', '17:00'],
    primera_fecha: dia(0), dias_disponibles: 3,
  },
  {
    slug: 'vermut-vilafranca', titulo: 'Vermouth hour in Vilafranca',
    resumen: 'Vermouth and olives on the square', provincia: 'barcelona',
    city: 'Vilafranca del Penedes', categoria: 'gastro', imagen: '',
    precio: 18, duracion_min: 60, min_personas: 1, max_personas: 8,
    punto_encuentro: 'Placa de la Vila', horas: ['19:00'],
    primera_fecha: dia(0), dias_disponibles: 3,
  },
];

const DIAS = {
  'cata-vinos-penedes': [
    { date: dia(0), slots: [{ time: '11:00', free: 8 }, { time: '17:00', free: 4 }] },
    { date: dia(1), slots: [{ time: '11:00', free: 8 }] },
  ],
  'vermut-vilafranca': [
    { date: dia(0), slots: [{ time: '19:00', free: 6 }] },
    { date: dia(1), slots: [{ time: '19:00', free: 6 }] },
  ],
};

const CORS = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
let enviados = [];
let rechazar = null;   // {error, parada} para simular que el CRM dice que no

async function simularCrm(page) {
  enviados = [];
  await page.route(`${CRM}/api/publico/**`, async (route) => {
    const url = route.request().url();
    if (url.includes('/actividades')) {
      return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ actividades: ACTIVIDADES }) });
    }
    if (url.includes('/disponibilidad')) {
      const slug = new URL(url).searchParams.get('slug');
      const a = ACTIVIDADES.find((x) => x.slug === slug);
      return route.fulfill({
        status: 200, headers: CORS,
        body: JSON.stringify({ slug, titulo: a.titulo, precio: a.precio,
          min_personas: a.min_personas, max_personas: a.max_personas,
          duracion_min: a.duracion_min, punto_encuentro: a.punto_encuentro,
          dias: DIAS[slug] }),
      });
    }
    // POST /reservas
    const cuerpo = JSON.parse(route.request().postData() || '{}');
    enviados.push(cuerpo);
    if (rechazar) {
      return route.fulfill({ status: 409, headers: CORS, body: JSON.stringify(rechazar) });
    }
    const items = (cuerpo.items || []).map((it, i) => {
      const a = ACTIVIDADES.find((x) => x.slug === it.slug);
      return { referencia: 'NTL-P' + i + 'AAAA', actividad: a.titulo, fecha: it.fecha,
        hora: it.hora, personas: it.personas, total: a.precio * it.personas,
        punto_encuentro: a.punto_encuentro };
    });
    return route.fulfill({
      status: 201, headers: CORS,
      body: JSON.stringify({ ok: true, referencia: 'NTL-GRUPO1', paradas: items.length,
        total: items.reduce((n, x) => n + x.total, 0), items }),
    });
  });
}

const browser = await chromium.launch();

async function abrirPlanMixto(ctx) {
  const page = await ctx.newPage();
  await simularCrm(page);
  await page.goto(BASE + '?ref=EST-00012', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#btnPlans', { timeout: 8000 });
  await page.waitForTimeout(900);           // own.js resuelve las paradas propias
  await page.click('#btnPlans');
  await page.waitForSelector('.ntl-pcard', { state: 'visible', timeout: 8000 });
  await page.locator('.ntl-pcard', { hasText: PLAN }).first().click();
  await page.waitForSelector('.ntl-step', { timeout: 5000 });
  await page.waitForTimeout(400);
  return page;
}

/** Elige la primera fecha y hora disponibles de la enesima parada nuestra. */
async function elegir(page, n, personas = 1) {
  await page.locator('.ntl-step-propia .ntl-step-elegir').nth(n).click();
  await page.waitForSelector('.ntl-sel-dia', { timeout: 8000 });
  await page.waitForTimeout(250);
  await page.locator('.ntl-sel-hora').first().click();
  await page.waitForTimeout(150);
  for (let i = 1; i < personas; i++) {
    await page.locator('.ntl-bk-pm[data-pers="1"]').click();
    await page.waitForTimeout(120);
  }
  await page.locator('.ntl-sel-ok').click();
  await page.waitForTimeout(400);
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
const errores = [];
ctx.on('page', (p) => p.on('pageerror', (e) => errores.push(e.message)));
let page = await abrirPlanMixto(ctx);

// ---------- 1. Las paradas nuestras se distinguen ----------
const pinta = await page.evaluate(() => ({
  propias: document.querySelectorAll('.ntl-step-propia').length,
  gyg: document.querySelectorAll('.ntl-step[data-tour]').length,
  distintivo: document.querySelector('.ntl-step-propia .ntl-badge')?.textContent.trim(),
  checkout: !!document.querySelector('.ntl-co'),
  cab: document.querySelector('.ntl-co-cab p')?.textContent || '',
}));
log('Las dos paradas nuestras se pintan como nuestras',
  pinta.propias === 2 && pinta.distintivo === 'NTL EXPERIENCE', JSON.stringify(pinta).slice(0, 90));
log('Y conviven con la de GetYourGuide', pinta.gyg === 1, `${pinta.gyg} de GYG`);
log('El checkout dice cuantas entran y cuantas no',
  pinta.checkout && /2 of the 3 stops are ours/.test(pinta.cab) && /GetYourGuide/.test(pinta.cab),
  pinta.cab.slice(0, 80));

// ---------- 2. Sin fechas no se puede confirmar ----------
const sinFechas = await page.evaluate(() => ({
  aviso: document.querySelector('.ntl-co-falta')?.textContent || '',
  form: !!document.querySelector('.ntl-co-form'),
}));
log('Sin elegir fechas no ofrece confirmar',
  sinFechas.form === false && /Pick a date/i.test(sinFechas.aviso), sinFechas.aviso.trim());

// ---------- 3. Elegir una sola deja el aviso de lo que falta ----------
await elegir(page, 0, 2);
const media = await page.evaluate(() => ({
  listas: document.querySelectorAll('.ntl-step-propia.is-listo').length,
  aviso: document.querySelector('.ntl-co-falta')?.textContent || '',
  form: !!document.querySelector('.ntl-co-form'),
}));
log('Con una elegida sigue faltando la otra',
  media.listas === 1 && media.form === false && /1 more/.test(media.aviso), JSON.stringify(media));

// ---------- 4. Con las dos: total correcto ----------
await elegir(page, 1, 2);
const listo = await page.evaluate(() => ({
  listas: document.querySelectorAll('.ntl-step-propia.is-listo').length,
  lineas: document.querySelectorAll('.ntl-co-linea').length,
  total: document.querySelector('.ntl-co-total b')?.textContent,
  boton: document.querySelector('.ntl-co-go')?.textContent.trim(),
}));
// 2 personas x 35 + 2 x 18 = 106
log('Con las dos elegidas suma el total del plan',
  listo.listas === 2 && /106/.test(listo.total || ''), JSON.stringify(listo));
log('Y el boton dice cuantas paradas y cuanto', /2 stops/.test(listo.boton || '') && /106/.test(listo.boton || ''),
  listo.boton);

// ---------- 5. LA PRUEBA CLAVE: un solo envio con las dos ----------
await page.fill('.ntl-co-campos input[name="nombre"]', 'Marc Delgado');
await page.fill('.ntl-co-campos input[name="email"]', 'marc@example.com');
await page.click('.ntl-co-go');
await page.waitForSelector('.ntl-co-done', { timeout: 8000 });

log('Se envia UNA sola peticion, no una por parada', enviados.length === 1, `${enviados.length} peticiones`);
const env = enviados[0] || {};
log('Y lleva las dos paradas dentro',
  Array.isArray(env.items) && env.items.length === 2 &&
  env.items[0].slug === 'cata-vinos-penedes' && env.items[1].slug === 'vermut-vilafranca',
  JSON.stringify(env.items));
log('Con el codigo del QR, que es de donde sale la comision',
  env.ref === 'EST-00012', String(env.ref));
log('El precio no lo pone el navegador',
  env.items && env.items.every((i) => i.total === undefined), 'sin importes en el envio');

// ---------- 6. Un localizador para todo el plan ----------
const done = await page.evaluate(() => ({
  ref: document.querySelector('.ntl-bk-refn')?.textContent,
  titulo: document.querySelector('.ntl-co-done h4')?.textContent,
  filas: document.querySelectorAll('.ntl-bk-recap > div').length,
}));
log('Un solo localizador para el plan entero',
  done.ref === 'NTL-GRUPO1' && /All 2 stops/.test(done.titulo || ''), JSON.stringify(done));
log('Con el desglose de cada parada', done.filas === 3, `${done.filas} filas (2 paradas + total)`);

// ---------- 7. El contador de arriba cuenta las dos clases ----------
const contador = await page.evaluate(() => ({
  txt: document.querySelector('.ntl-cesta-txt b')?.textContent,
  barra: document.querySelector('.ntl-cesta-barra i')?.style.width,
}));
log('El contador de arriba incluye las paradas nuestras',
  contador.txt === '2 of 3 stops booked' && contador.barra === '67%', JSON.stringify(contador));
await page.close();

// ---------- 8. Si el CRM dice que no, se dice cual falla ----------
rechazar = { error: 'Vermouth hour in Vilafranca: Solo quedan 1 plazas en esa hora.', parada: 1 };
page = await abrirPlanMixto(ctx);
await elegir(page, 0);
await elegir(page, 1);
await page.fill('.ntl-co-campos input[name="nombre"]', 'Ana Puig');
await page.fill('.ntl-co-campos input[name="email"]', 'ana@example.com');
await page.click('.ntl-co-go');
await page.waitForTimeout(900);
const fallo = await page.evaluate(() => ({
  error: document.querySelector('.ntl-co-error')?.textContent || null,
  hecho: !!document.querySelector('.ntl-co-done'),
  boton: document.querySelector('.ntl-co-go')?.disabled,
}));
log('Si el CRM rechaza, no se da por hecho y se dice cual falla',
  fallo.hecho === false && /Vermouth/.test(fallo.error || ''), JSON.stringify(fallo));
log('Y se puede volver a intentar', fallo.boton === false, `deshabilitado=${fallo.boton}`);
rechazar = null;
await page.close();

// ---------- 9. Sin CRM, el plan no se rompe ----------
{
  const p3 = await ctx.newPage();
  await p3.route(`${CRM}/api/publico/**`, (r) => r.fulfill({ status: 500, headers: CORS, body: '{}' }));
  await p3.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p3.waitForSelector('#btnPlans', { timeout: 8000 });
  await p3.waitForTimeout(900);
  await p3.click('#btnPlans');
  await p3.waitForSelector('.ntl-pcard', { state: 'visible', timeout: 8000 });
  await p3.locator('.ntl-pcard', { hasText: PLAN }).first().click();
  await p3.waitForSelector('.ntl-step', { timeout: 5000 });
  await p3.waitForTimeout(400);
  const caido = await p3.evaluate(() => ({
    pasos: document.querySelectorAll('.ntl-step').length,
    ausentes: document.querySelectorAll('.ntl-step.is-ausente').length,
    checkout: !!document.querySelector('.ntl-co'),
    gyg: document.querySelectorAll('.ntl-step[data-tour] .ntl-step-book').length,
  }));
  log('Con el CRM caido el plan se ve y la parada de GYG sigue reservable',
    caido.pasos === 3 && caido.ausentes === 2 && caido.checkout === false && caido.gyg === 1,
    JSON.stringify(caido));
  await p3.close();
}

log('Sin errores de JS', errores.length === 0, errores.slice(0, 2).join(' | ') || 'ninguno');

await ctx.close();
await browser.close();
const fallos = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - fallos.length}/${results.length} pruebas OK ===`);
if (fallos.length) {
  console.log('FALLOS:');
  fallos.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail));
  process.exitCode = 1;
}
