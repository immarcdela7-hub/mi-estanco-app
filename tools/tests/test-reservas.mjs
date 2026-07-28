/* Reserva de actividades propias, de punta a punta dentro de la web.
   Es la bateria que demuestra lo que las de GetYourGuide no pueden hacer: que
   el cliente elija dia, hora y personas, vea el total y confirme sin salir de
   notaxlost.com. El CRM se simula con page.route, asi la prueba no necesita
   base de datos ni red. */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8099/tickets.html';
const CRM = 'https://crm.notaxlost.com';

const results = [];
function log(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -- ' + detail : ''}`);
}

// --- CRM simulado -----------------------------------------------------------
const dia = (n) => {
  const d = new Date(Date.UTC(2026, 6, 27) + n * 86400000);
  return d.toISOString().slice(0, 10);
};

const ACTIVIDAD = {
  slug: 'cata-vinos-penedes',
  titulo: 'Wine tasting in the Penedes',
  resumen: 'Three wines and a cellar visit, with the winemaker',
  descripcion: 'Una cata guiada en una bodega familiar.',
  provincia: 'barcelona',
  city: 'Vilafranca del Penedes',
  categoria: 'gastro',
  imagen: '',
  precio: 35,
  moneda: 'EUR',
  duracion_min: 90,
  min_personas: 2,
  max_personas: 8,
  punto_encuentro: 'Celler Can Ramon, Carrer Major 12',
  horas: ['11:00', '17:00'],
  primera_fecha: dia(1),
  dias_disponibles: 3,
};

const DISPONIBILIDAD = {
  slug: ACTIVIDAD.slug,
  titulo: ACTIVIDAD.titulo,
  precio: 35,
  min_personas: 2,
  max_personas: 8,
  duracion_min: 90,
  punto_encuentro: ACTIVIDAD.punto_encuentro,
  dias: [
    { date: dia(1), slots: [{ time: '11:00', free: 8 }, { time: '17:00', free: 3 }] },
    { date: dia(2), slots: [{ time: '17:00', free: 5 }] },
    { date: dia(4), slots: [{ time: '11:00', free: 2 }] },
  ],
};

const CORS = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
let ultimaReserva = null;
let fallarCatalogo = false;

async function simularCrm(page) {
  ultimaReserva = null;
  await page.route(`${CRM}/api/publico/**`, async (route) => {
    const url = route.request().url();
    if (url.includes('/actividades')) {
      if (fallarCatalogo) return route.fulfill({ status: 500, headers: CORS, body: '{}' });
      return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ actividades: [ACTIVIDAD] }) });
    }
    if (url.includes('/disponibilidad')) {
      return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(DISPONIBILIDAD) });
    }
    if (url.includes('/reservas')) {
      ultimaReserva = JSON.parse(route.request().postData() || '{}');
      // Carrera: otro cliente se ha quedado con las plazas entre que se pinto
      // el calendario y se pulso confirmar. El CRM es quien lo detecta.
      if (ultimaReserva.email === 'tarde@example.com') {
        return route.fulfill({
          status: 409, headers: CORS,
          body: JSON.stringify({ error: 'Solo quedan 3 plazas en esa hora.' }),
        });
      }
      return route.fulfill({
        status: 201, headers: CORS,
        body: JSON.stringify({
          ok: true, referencia: 'NTL-K4M2X9', actividad: ACTIVIDAD.titulo,
          fecha: ultimaReserva.fecha, hora: ultimaReserva.hora, personas: ultimaReserva.personas,
          total: 35 * ultimaReserva.personas, punto_encuentro: ACTIVIDAD.punto_encuentro,
        }),
      });
    }
    return route.fulfill({ status: 404, headers: CORS, body: '{}' });
  });
}

const browser = await chromium.launch();

// ---------- 1. La actividad propia entra en el catalogo ----------
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errores = [];
page.on('pageerror', (e) => errores.push(e.message));
await simularCrm(page);
await page.goto(BASE + '?ref=EST-00012', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.experience-item.ntl-own', { timeout: 5000 }).catch(() => {});

const propias = await page.locator('.experience-item.ntl-own').count();
log('La actividad propia se pinta en el catalogo', propias === 1, `${propias} tarjetas propias`);

const total = await page.locator('.experience-item').count();
log('Convive con las 153 de GetYourGuide', total === 154, `${total} tarjetas en total`);

const distintivo = await page.evaluate(() => {
  const c = document.querySelector('.experience-item.ntl-own');
  return {
    flag: c?.querySelector('.ntl-badge')?.textContent.trim(),
    boton: c?.querySelector('.ntl-own-dates')?.textContent.trim(),
    href: c?.querySelector('.item-link')?.getAttribute('href'),
  };
});
log('Se distingue de las de GetYourGuide', distintivo.flag === 'NTL EXPERIENCE', JSON.stringify(distintivo));
log('No lleva a ningun dominio ajeno', /^\?actividad=/.test(distintivo.href || ''), distintivo.href);

// LA PRUEBA QUE NUNCA DEBE FALLAR: las propias no pueden romper la atribucion
// de las de GYG, que es de donde salen los ingresos hoy.
const atrib = await page.evaluate(() => {
  const as = [...document.querySelectorAll('a[href*="getyourguide."]')];
  return { total: as.length, conCmp: as.filter((a) => a.href.includes('cmp=EST-00012')).length };
});
log('La atribucion de GetYourGuide sigue intacta',
  atrib.total > 0 && atrib.conCmp === atrib.total, `${atrib.conCmp}/${atrib.total}`);

// ---------- 2. Entra en los filtros como una mas ----------
await page.click('button.province-btn[data-province="girona"]');
await page.waitForTimeout(300);
const enGirona = await page.evaluate(() =>
  document.querySelector('.experience-item.ntl-own').offsetParent !== null);
log('Se oculta cuando se filtra otra provincia', enGirona === false, `visible=${enGirona}`);

await page.click('button.province-btn[data-province="barcelona"]');
await page.waitForTimeout(300);
const enBcn = await page.evaluate(() =>
  document.querySelector('.experience-item.ntl-own').offsetParent !== null);
log('Vuelve al filtrar por la suya', enBcn === true, `visible=${enBcn}`);

await page.fill('#searchInput', 'wine tasting');
await page.waitForTimeout(350);
const buscada = await page.evaluate(() =>
  document.querySelector('.experience-item.ntl-own').offsetParent !== null);
log('El buscador la encuentra', buscada === true, `visible=${buscada}`);
await page.fill('#searchInput', '');
await page.waitForTimeout(250);

// ---------- 3. El reservador abre DENTRO de la web ----------
const antes = page.url();
await page.click('.experience-item.ntl-own .ntl-own-dates');
await page.waitForSelector('#ownModal:not([hidden])', { timeout: 4000 });
await page.waitForSelector('.ntl-bk-day', { timeout: 4000 });

log('Abrir la reserva no navega fuera', page.url().split('?')[0] === antes.split('?')[0], page.url());
const dentro = await page.evaluate(() => ({
  titulo: document.getElementById('ownModalTitle').textContent,
  iframes: document.querySelectorAll('#ownModal iframe').length,
  dias: document.querySelectorAll('.ntl-bk-day').length,
}));
log('El reservador es nuestro, sin iframes de terceros', dentro.iframes === 0, JSON.stringify(dentro));
log('Muestra los tres dias con hueco', dentro.dias === 3, `${dentro.dias} dias`);

// El boton de la tarjeta propia comparte sitio con el de GetYourGuide. Si se
// le cuela la clase .ntl-card-dates, el catalogo abre ADEMAS su widget sin
// tour y sale su anuncio generico encima de nuestra reserva.
const soloUno = await page.evaluate(() => ({
  gyg: document.getElementById('availModal')?.hidden,
  nuestro: document.getElementById('ownModal')?.hidden,
}));
log('No se abre tambien el modal de GetYourGuide',
  soloUno.gyg === true && soloUno.nuestro === false, JSON.stringify(soloUno));

// ---------- 4. Dia, hora, personas y total ----------
const inicio = await page.evaluate(() => ({
  diaMarcado: document.querySelector('.ntl-bk-day.is-on')?.dataset.fecha,
  horaMarcada: document.querySelector('.ntl-bk-slot.is-on')?.dataset.hora ?? null,
  personas: document.querySelector('.ntl-bk-n')?.textContent,
  boton: document.querySelector('.ntl-bk-go')?.textContent.trim(),
  deshabilitado: document.querySelector('.ntl-bk-go')?.disabled,
  total: document.querySelector('.ntl-bk-total b')?.textContent,
}));
log('Empieza en el primer dia libre y con la primera hora marcada',
  inicio.diaMarcado === dia(1) && inicio.horaMarcada === '11:00', JSON.stringify(inicio));
log('Arranca con el minimo de personas de la actividad', inicio.personas === '2', inicio.personas);
log('El total es el precio real por las personas', /70/.test(inicio.total || ''), inicio.total);
log('Se puede seguir desde el primer momento', inicio.deshabilitado === false, inicio.boton);

// Paso 1 y paso 2: quien abre esto quiere ver si hay sitio, no dar sus datos.
const dosPasos = await page.evaluate(() => ({
  pasos: document.querySelectorAll('.ntl-bk-pasos li').length,
  ahora: document.querySelector('.ntl-bk-pasos li.is-ahora')?.textContent,
  campos: document.querySelectorAll('.ntl-bk-field input').length,
}));
log('El primer paso no pide datos personales',
  dosPasos.pasos === 2 && dosPasos.campos === 0 && /Date/.test(dosPasos.ahora || ''),
  JSON.stringify(dosPasos));

await page.click('.ntl-bk-pm[data-people="1"]');
await page.waitForTimeout(150);
const tres = await page.evaluate(() => ({
  n: document.querySelector('.ntl-bk-n')?.textContent,
  total: document.querySelector('.ntl-bk-total b')?.textContent,
}));
log('Sumar una persona recalcula el total', tres.n === '3' && /105/.test(tres.total || ''),
  JSON.stringify(tres));

// El cupo de la hora manda: 17:00 del primer dia solo tiene 3 plazas.
await page.click('.ntl-bk-pm[data-people="1"]');
await page.click('.ntl-bk-pm[data-people="1"]');
await page.waitForTimeout(150);
const cinco = await page.evaluate(() => document.querySelector('.ntl-bk-n')?.textContent);
log('Con plazas de sobra se puede subir', cinco === '5', `${cinco} personas con 8 libres`);

await page.click('.ntl-bk-slot[data-hora="17:00"]');
await page.waitForTimeout(200);
const tope = await page.evaluate(() => ({
  n: document.querySelector('.ntl-bk-n')?.textContent,
  mas: document.querySelector('.ntl-bk-pm[data-people="1"]')?.disabled,
  menos: document.querySelector('.ntl-bk-pm[data-people="-1"]')?.disabled,
}));
log('Al cambiar a una hora con menos sitio se ajusta el grupo',
  tope.n === '3', `${tope.n} personas con 3 libres`);
log('Y el boton de sumar se apaga en el tope', tope.mas === true, JSON.stringify(tope));

// Bajar hasta el minimo apaga el otro boton, en vez de dejar restar a cero.
await page.click('.ntl-bk-pm[data-people="-1"]');
await page.waitForTimeout(150);
const minimo = await page.evaluate(() => ({
  n: document.querySelector('.ntl-bk-n')?.textContent,
  menos: document.querySelector('.ntl-bk-pm[data-people="-1"]')?.disabled,
  pista: document.querySelector('.ntl-bk-pista')?.textContent,
}));
log('No se puede bajar del minimo de la actividad',
  minimo.n === '2' && minimo.menos === true, JSON.stringify(minimo));
log('Y se explica por que', /from 2 people/.test(minimo.pista || ''), minimo.pista);
await page.click('.ntl-bk-pm[data-people="1"]');
await page.waitForTimeout(150);

// Cambiar de dia deja marcada su primera hora, sin dejar el paso en blanco.
await page.click(`.ntl-bk-day[data-fecha="${dia(2)}"]`);
await page.waitForTimeout(200);
const unaHora = await page.evaluate(() => ({
  horas: document.querySelectorAll('.ntl-bk-slot').length,
  marcada: document.querySelector('.ntl-bk-slot.is-on')?.dataset.hora ?? null,
}));
log('Al cambiar de dia se marca su primera hora',
  unaHora.horas === 1 && unaHora.marcada === '17:00', JSON.stringify(unaHora));

// ---------- 5. Paso 2: los datos, con lo elegido a la vista ----------
await page.click('[data-continuar]');
await page.waitForSelector('.ntl-bk-form', { timeout: 4000 });
const paso2 = await page.evaluate(() => ({
  elegido: document.querySelector('.ntl-bk-elegido')?.textContent,
  hecho: !!document.querySelector('.ntl-bk-pasos li.is-hecho'),
  boton: document.querySelector('.ntl-bk-form .ntl-bk-go')?.textContent.trim(),
}));
log('El paso 2 recuerda dia, hora, personas e importe',
  /17:00/.test(paso2.elegido || '') && /3 people/.test(paso2.elegido || '') &&
  /105/.test(paso2.elegido || ''), paso2.elegido);
log('Y el primer paso queda marcado como hecho', paso2.hecho === true, '');
log('El boton dice exactamente lo que se paga', /105/.test(paso2.boton || ''), paso2.boton);

// Volver atras no pierde lo elegido: cambiar de idea es gratis.
await page.click('[data-volver]');
await page.waitForSelector('.ntl-bk-day', { timeout: 4000 });
const vuelta = await page.evaluate(() => ({
  dia: document.querySelector('.ntl-bk-day.is-on')?.dataset.fecha,
  hora: document.querySelector('.ntl-bk-slot.is-on')?.dataset.hora,
  personas: document.querySelector('.ntl-bk-n')?.textContent,
}));
log('Volver atras conserva la eleccion',
  vuelta.dia === dia(2) && vuelta.hora === '17:00' && vuelta.personas === '3',
  JSON.stringify(vuelta));
await page.click('[data-continuar]');
await page.waitForSelector('.ntl-bk-form', { timeout: 4000 });

// ---------- 6. Confirmar: la reserva se cierra aqui ----------
await page.fill('.ntl-bk-field input[name="nombre"]', 'Marc Delgado');
await page.fill('.ntl-bk-field input[name="email"]', 'marc@example.com');
await page.fill('.ntl-bk-field input[name="telefono"]', '600123456');
await page.click('.ntl-bk-go');
await page.waitForSelector('.ntl-bk-done', { timeout: 5000 });

log('La confirmacion se ve en nuestra web', await page.locator('.ntl-bk-done').isVisible(), '');
const recibo = await page.evaluate(() => ({
  ref: document.querySelector('.ntl-bk-refn')?.textContent,
  texto: document.querySelector('.ntl-bk-recap')?.textContent,
  url: location.href,
}));
log('Da el localizador al cliente', recibo.ref === 'NTL-K4M2X9', recibo.ref);
log('Recuerda punto de encuentro y total',
  /Celler Can Ramon/.test(recibo.texto || '') && /105/.test(recibo.texto || ''), recibo.texto);
log('Y todo sin salir de notaxlost', /127\.0\.0\.1:8099/.test(recibo.url), recibo.url);

// LA OTRA PRUEBA CRITICA: sin el codigo del QR la venta no se puede repartir.
log('La reserva viaja con el codigo del QR', ultimaReserva && ultimaReserva.ref === 'EST-00012',
  ultimaReserva ? ultimaReserva.ref : 'sin reserva');
log('El precio no lo pone el navegador (lo calcula el CRM)',
  ultimaReserva && ultimaReserva.total === undefined && ultimaReserva.personas === 3,
  JSON.stringify(ultimaReserva));
log('Lleva relleno el campo trampa vacio', ultimaReserva && ultimaReserva.web === '',
  String(ultimaReserva && ultimaReserva.web));

// ---------- 6. Errores del CRM: se ven, no se tragan ----------
const p2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await simularCrm(p2);
await p2.goto(BASE, { waitUntil: 'domcontentloaded' });
await p2.waitForSelector('.ntl-own-dates', { timeout: 5000 });
await p2.click('.ntl-own-dates');
await p2.waitForSelector('.ntl-bk-day', { timeout: 4000 });
await p2.click('.ntl-bk-slot[data-hora="17:00"]');
await p2.waitForTimeout(150);
await p2.click('[data-continuar]');
await p2.waitForSelector('.ntl-bk-form', { timeout: 4000 });
await p2.fill('.ntl-bk-field input[name="nombre"]', 'Ana Puig');
await p2.fill('.ntl-bk-field input[name="email"]', 'tarde@example.com');
await p2.click('.ntl-bk-form .ntl-bk-go');
await p2.waitForTimeout(900);
const conflicto = await p2.evaluate(() => ({
  error: document.querySelector('.ntl-bk-error')?.textContent ?? null,
  hecho: !!document.querySelector('.ntl-bk-done'),
  boton: document.querySelector('.ntl-bk-form .ntl-bk-go')?.disabled,
}));
log('Si el CRM rechaza por cupo, se dice y no se da por hecha',
  conflicto.hecho === false && /3 plazas/.test(conflicto.error || ''), JSON.stringify(conflicto));
log('Y se puede volver a intentar', conflicto.boton === false, `deshabilitado=${conflicto.boton}`);

// Sin nombre ni correo no se envia nada: la reserva necesita a quien avisar.
await p2.fill('.ntl-bk-field input[name="email"]', '');
const previa = ultimaReserva;
await p2.click('.ntl-bk-form .ntl-bk-go');
await p2.waitForTimeout(400);
log('No se envia sin correo de contacto', ultimaReserva === previa, 'no hubo peticion nueva');
await p2.close();

// ---------- 7. Sin CRM la web sigue entera ----------
fallarCatalogo = true;
const p3 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const err3 = [];
p3.on('pageerror', (e) => err3.push(e.message));
await simularCrm(p3);
await p3.goto(BASE + '?ref=EST-00012', { waitUntil: 'domcontentloaded' });
// Esperar a que existan las tarjetas, no un tiempo fijo: con 153 el render tarda
// mas y 1,5 s daba "0 tarjetas" como si el catalogo se hubiera roto.
await p3.waitForSelector('.experience-item', { timeout: 20000 });
await p3.waitForTimeout(500);
const sinCrm = await p3.evaluate(() => {
  const as = [...document.querySelectorAll('a[href*="getyourguide."]')];
  return {
    tarjetas: document.querySelectorAll('.experience-item').length,
    propias: document.querySelectorAll('.ntl-own').length,
    conCmp: as.filter((a) => a.href.includes('cmp=EST-00012')).length,
    total: as.length,
  };
});
log('Con el CRM caido el catalogo sigue completo',
  sinCrm.tarjetas === 153 && sinCrm.propias === 0, JSON.stringify(sinCrm));
log('Y la atribucion tampoco se resiente',
  sinCrm.total > 0 && sinCrm.conCmp === sinCrm.total, `${sinCrm.conCmp}/${sinCrm.total}`);
log('Sin errores de JS al fallar el CRM', err3.length === 0, err3.slice(0, 2).join(' | ') || 'ninguno');
await p3.close();
fallarCatalogo = false;

// ---------- 8. Movil ----------
const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await simularCrm(mob);
await mob.goto(BASE, { waitUntil: 'domcontentloaded' });
await mob.waitForSelector('.ntl-own-dates', { timeout: 5000 });
await mob.click('.ntl-own-dates');
await mob.waitForSelector('.ntl-bk-day', { timeout: 4000 });
const movil = await mob.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
  cajaVisible: document.querySelector('.ntl-bk-days')?.getBoundingClientRect().width > 0,
}));
log('Movil 390px: el reservador cabe sin desbordar',
  movil.scrollW <= movil.clientW + 1 && movil.cajaVisible, JSON.stringify(movil));
await mob.screenshot({ path: 'capturas/reserva-movil.png' });
await mob.close();

log('Sin errores de JS en consola', errores.length === 0, errores.slice(0, 3).join(' | ') || 'ninguno');

await browser.close();
const fallos = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - fallos.length}/${results.length} pruebas OK ===`);
if (fallos.length) {
  console.log('FALLOS:');
  fallos.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail));
  process.exitCode = 1;
}
