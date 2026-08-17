import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8099/tickets.html';

// Consentimiento ya dado: estas baterias prueban la atribucion, no el aviso de
// cookies (eso vive en test-consentimiento.mjs). Sin esto, el aviso tapa la
// parte baja de la pagina y los clics fallan.
const CONSENT_ACEPTADO = [{
  name: 'ntl_consent', value: 'v1%3Aafiliacion%3D1%3Ats%3D1',
  domain: '127.0.0.1', path: '/',
}];

const browser = await chromium.launch();
const results = [];
function log(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -- ' + detail : ''}`);
}

// ---------- 1. Desktop: render + atribucion ----------
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.context().addCookies(CONSENT_ACEPTADO);
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));

await page.goto(BASE + '?ref=PRUEBA1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

const nCards = await page.locator('.experience-item:not(.ntl-own)').count();
log('Se renderizan 153 tarjetas', nCards === 153, `encontradas ${nCards}`);

// Atribucion: TODOS los enlaces GYG deben llevar cmp + partner_id
const linkAudit = await page.evaluate(() => {
  const as = [...document.querySelectorAll('a[href*="getyourguide."]')];
  return {
    total: as.length,
    conCmp: as.filter((a) => a.href.includes('cmp=PRUEBA1')).length,
    conPartner: as.filter((a) => a.href.includes('partner_id=IBO5PAK')).length,
    conUtm: as.filter((a) => a.href.includes('utm_medium=local_partners')).length,
    ejemplo: as[0] ? as[0].href : null,
  };
});
log('Todos los enlaces GYG llevan cmp=PRUEBA1', linkAudit.total > 0 && linkAudit.conCmp === linkAudit.total,
  `${linkAudit.conCmp}/${linkAudit.total}`);
log('Todos conservan partner_id=IBO5PAK', linkAudit.conPartner === linkAudit.total,
  `${linkAudit.conPartner}/${linkAudit.total}`);
log('Todos conservan utm_medium', linkAudit.conUtm === linkAudit.total, `${linkAudit.conUtm}/${linkAudit.total}`);
console.log('   ejemplo:', linkAudit.ejemplo);

// ---------- 2. Cookie: segunda visita SIN ?ref= ----------
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const cookieCmp = await page.evaluate(() => {
  const as = [...document.querySelectorAll('a[href*="getyourguide."]')];
  return { total: as.length, conCmp: as.filter((a) => a.href.includes('cmp=PRUEBA1')).length };
});
log('Con permiso, la cookie recuerda el local sin ?ref= (2a visita)', cookieCmp.total > 0 && cookieCmp.conCmp === cookieCmp.total,
  `${cookieCmp.conCmp}/${cookieCmp.total}`);

// ---------- 3. Filtros ----------
async function visibles() {
  return page.evaluate(() => [...document.querySelectorAll('.experience-item:not(.ntl-own)')]
    .filter((e) => e.offsetParent !== null).length);
}
await page.click('button.province-btn[data-province="lleida"]');
await page.waitForTimeout(400);
const vLleida = await visibles();
log('Filtro provincia Lleida', vLleida > 0 && vLleida < 153, `${vLleida} visibles`);

await page.click('button.province-btn[data-province="barcelona"]');
await page.waitForTimeout(400);
const vBcn = await visibles();
log('Filtro provincia Barcelona', vBcn > 0 && vBcn < 153, `${vBcn} visibles`);

await page.click('[data-filter="culture"]');
await page.waitForTimeout(400);
const vCombo = await visibles();
log('Combinado Barcelona+Culture', vCombo > 0 && vCombo <= vBcn, `${vCombo} visibles`);

await page.click('button.province-btn[data-province="all"]');
await page.click('[data-filter="all"]');
await page.waitForTimeout(400);
const vAll = await visibles();
log('Reset a todo', vAll === 153, `${vAll} visibles`);

// Combinacion vacia (Lleida + una categoria que quiza no tenga)
await page.click('button.province-btn[data-province="lleida"]');
await page.click('[data-filter="sea"]');
await page.waitForTimeout(400);
const vVacio = await visibles();
const emptyShown = await page.evaluate(() => {
  const el = document.getElementById('emptyState');
  return el ? el.offsetParent !== null : null;
});
log('Estado vacio coherente', vVacio > 0 ? emptyShown === false : emptyShown === true,
  `${vVacio} visibles, emptyState=${emptyShown}`);

// ---------- 4. Busqueda ----------
await page.click('button.province-btn[data-province="all"]');
await page.click('[data-filter="all"]');
await page.fill('#searchInput', 'sagrada');
await page.waitForTimeout(500);
const vSearch = await visibles();
log('Buscador funciona', vSearch > 0 && vSearch < 153, `${vSearch} resultados para "sagrada"`);

// ---------- 5. Deep link ?zona= junto a ?ref= ----------
await page.goto(BASE + '?ref=EST-TEST9&zona=salou', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const zonaTest = await page.evaluate(() => {
  const as = [...document.querySelectorAll('a[href*="getyourguide."]')];
  const vis = [...document.querySelectorAll('.experience-item')].filter((e) => e.offsetParent !== null).length;
  return { visibles: vis, total: as.length, conCmp: as.filter((a) => a.href.includes('cmp=EST-TEST9')).length };
});
log('?zona= no rompe la atribucion ?ref=', zonaTest.conCmp === zonaTest.total && zonaTest.total > 0,
  `${zonaTest.conCmp}/${zonaTest.total} con cmp, ${zonaTest.visibles} visibles`);

// ---------- 6. Movil 390px: desbordamiento ----------
const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mobErrors = [];
mob.on('pageerror', (e) => mobErrors.push(e.message));
await mob.goto(BASE + '?ref=PRUEBA1', { waitUntil: 'domcontentloaded' });
// Esperar a que existan las tarjetas, no un tiempo fijo: con 153 el render
// tarda mas y un sleep corto daba "0 tarjetas" sin que nada estuviera roto.
await mob.waitForSelector('.experience-item', { timeout: 20000 });
await mob.waitForTimeout(600);
const overflow = await mob.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
  bodyScrollW: document.body.scrollWidth,
}));
log('Movil 390px sin desbordamiento horizontal',
  overflow.scrollW <= overflow.clientW + 1,
  `scrollW=${overflow.scrollW} clientW=${overflow.clientW}`);

const mobCards = await mob.locator('.experience-item:not(.ntl-own)').count();
log('Movil renderiza las tarjetas', mobCards === 153, `${mobCards} tarjetas`);
await mob.screenshot({ path: './capturas/movil.png' });
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
await page.screenshot({ path: './capturas/escritorio.png' });

// ---------- 6a-bis. Fechas y precio en vivo desde el catalogo ----------
const cp = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await cp.goto(BASE + '?ref=EST-00012', { waitUntil: 'domcontentloaded' });
await cp.waitForTimeout(1300);

const nBotones = await cp.locator('.ntl-card-dates').count();
log('Todas las tarjetas ofrecen ver fechas', nBotones === 153, `${nBotones} botones`);
log('La ventana empieza cerrada', await cp.locator('#availModal').isHidden());

await cp.locator('.ntl-card-dates').first().click();
await cp.waitForTimeout(400);
const modal = await cp.evaluate(() => {
  const d = document.querySelector('#availModalBody [data-gyg-widget]');
  return { abierto: !document.getElementById('availModal').hidden,
    titulo: document.getElementById('availModalTitle').textContent,
    tour: d ? d.dataset.gygTourId : null, cmp: d ? d.getAttribute('data-gyg-cmp') : null };
});
log('Al pulsar se abre con el widget de esa actividad',
  modal.abierto && /^\d+$/.test(modal.tour || '') && modal.titulo.length > 5, JSON.stringify(modal));
log('El widget del catalogo lleva el cmp', modal.cmp === 'EST-00012', modal.cmp);

// Cerrar debe descargar el iframe: si no, se quedaria consumiendo datos.
await cp.keyboard.press('Escape');
await cp.waitForTimeout(300);
const cerrado = await cp.evaluate(() => ({
  oculto: document.getElementById('availModal').hidden,
  vacio: document.getElementById('availModalBody').innerHTML === '',
  scroll: document.body.style.overflow,
}));
log('Escape cierra y descarga el iframe',
  cerrado.oculto && cerrado.vacio && cerrado.scroll !== 'hidden', JSON.stringify(cerrado));

// El refactor de la tarjeta no debe haber roto el enlace ni los filtros.
const tras = await cp.evaluate(() => {
  const as = [...document.querySelectorAll('.experience-item a[href*="getyourguide."]')];
  return { enlaces: as.length, cmp: as.filter((a) => a.href.includes('cmp=EST-00012')).length };
});
log('Cada tarjeta sigue enlazando con su atribucion',
  tras.enlaces === 153 && tras.cmp === 153, `${tras.cmp}/${tras.enlaces}`);
await cp.close();

// ---------- 6b. Widget de ciudad: perezoso y por provincia ----------
const wp = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await wp.goto(BASE + '?ref=EST-00012&zona=salou', { waitUntil: 'domcontentloaded' });
await wp.waitForTimeout(1200);

// Lo mas importante: no debe cargar nada hasta que el usuario llegue abajo.
// Tenerlos puestos de golpe costaba ~6 MB en la carga inicial.
const alCargar = await wp.evaluate(() => document.querySelectorAll('#cityWidgetBox [data-gyg-widget]').length);
log('No carga ningun widget de ciudad hasta verlo', alCargar === 0, `${alCargar} al cargar`);

await wp.evaluate(() => document.getElementById('discoverMore').scrollIntoView());
await wp.waitForTimeout(600);
const trasBajar = await wp.evaluate(() => {
  const ds = document.querySelectorAll('#cityWidgetBox [data-gyg-widget]');
  return { n: ds.length, loc: ds[0] ? ds[0].dataset.gygLocationId : null,
    cmp: ds[0] ? ds[0].getAttribute('data-gyg-cmp') : null,
    titulo: document.getElementById('discoverTitle').textContent };
});
log('Al llegar a la seccion monta uno solo',
  trasBajar.n === 1 && trasBajar.loc === '1884' && /Salou/.test(trasBajar.titulo), JSON.stringify(trasBajar));
log('Y lleva el cmp del establecimiento', trasBajar.cmp === 'EST-00012', trasBajar.cmp);

const esperado = { girona: '550', lleida: '100032', barcelona: '45', all: '45' };
let okProv = 0;
for (const [prov, loc] of Object.entries(esperado)) {
  await wp.click(`button.province-btn[data-province="${prov}"]`);
  await wp.waitForTimeout(280);
  const w = await wp.evaluate(() => {
    const ds = document.querySelectorAll('#cityWidgetBox [data-gyg-widget]');
    return { n: ds.length, loc: ds[0] ? ds[0].dataset.gygLocationId : null };
  });
  if (w.n === 1 && w.loc === loc) okProv++;
  else console.log(`   (${prov} esperaba ${loc}, obtuvo ${JSON.stringify(w)})`);
}
log('Cada provincia muestra su ciudad, sin acumular', okProv === 4, `${okProv}/4`);

// Sin ref no debe inventarse ningun cmp.
const wp2 = await browser.newPage();
await wp2.goto(BASE, { waitUntil: 'domcontentloaded' });
await wp2.waitForTimeout(700);
await wp2.evaluate(() => document.getElementById('discoverMore').scrollIntoView());
await wp2.waitForTimeout(600);
const sinRef = await wp2.evaluate(() => [...document.querySelectorAll('[data-gyg-widget]')]
  .filter((e) => e.hasAttribute('data-gyg-cmp')).length);
log('Sin ?ref= no se pone cmp', sinRef === 0, `${sinRef} con cmp`);
await wp2.close();
await wp.close();

// ---------- 7. Errores de consola ----------
const realErrors = consoleErrors.filter((e) => !/cdn\.getyourguide|widget\.getyourguide|ERR_|net::/i.test(e));
log('Sin errores de JS en consola', realErrors.length === 0, realErrors.slice(0, 3).join(' | ') || 'ninguno');

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} pruebas OK ===`);
if (failed.length) { console.log('FALLOS:'); failed.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail)); }
