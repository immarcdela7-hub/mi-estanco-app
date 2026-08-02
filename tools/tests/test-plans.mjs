import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8099/tickets.html';
const browser = await chromium.launch();
const results = [];
const log = (n, p, d) => { results.push({ n, p, d }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? ' -- ' + d : ''}`); };

async function pageAt(iso, viewport = { width: 1280, height: 900 }) {
  const p = await browser.newPage({ viewport });
  await p.addInitScript(`(() => { const F=new Date('${iso}').getTime(); const OD=Date;
    class D extends OD { constructor(...a){ if(!a.length) super(F); else super(...a);} static now(){return F;} }
    window.Date=D; })()`);
  return p;
}

const page = await pageAt('2026-07-25T20:30:00');
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/getyourguide|net::|ERR_/i.test(m.text())) errs.push(m.text()); });
await page.goto(BASE + '?ref=PRUEBA1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

// ---------- Estado inicial: catalogo, planes ocultos ----------
log('La vista de planes empieza oculta', await page.locator('#ntlPlansView').isHidden());
log('El catalogo se ve', await page.locator('#experiencesContainer').isVisible());
log('El boton de planes esta a la vista', await page.locator('#btnPlans').isVisible());

// ---------- La cabecera: flecha con texto + logo centrado ----------
const hd0 = await page.evaluate(() => {
  const l = document.getElementById('hdBackLabel');
  const b = document.getElementById('hdBack');
  const logo = document.querySelector('.ntl-hd-logo').getBoundingClientRect();
  return { label: l.textContent.trim(), href: b.getAttribute('href'),
    centroLogo: Math.round(logo.left + logo.width / 2), centroPagina: Math.round(innerWidth / 2) };
});
log('En el catalogo la flecha sale a notaxlost', hd0.label === 'Main site' && hd0.href === '/',
  JSON.stringify(hd0.label) + ' href=' + hd0.href);
log('El logo NTL queda centrado', Math.abs(hd0.centroLogo - hd0.centroPagina) <= 12,
  `logo=${hd0.centroLogo} centro=${hd0.centroPagina}`);

// ---------- Abrir la vista de planes ----------
await page.click('#btnPlans');
await page.waitForTimeout(500);
log('Al pulsar se abre la vista de planes', await page.locator('#ntlPlansView').isVisible());
log('Y el catalogo se oculta', await page.locator('#experiencesContainer').isHidden());
log('Y la barra de recomendaciones tambien', await page.locator('#ntlHelper').isHidden());
log('La flecha pasa a "Back to experiences"',
  (await page.textContent('#hdBackLabel')).trim() === 'Back to experiences');
// Ninguna seccion del catalogo debe quedar visible (ojo: las que llevan la
// clase "flex" de Tailwind ignoran el atributo hidden sin CSS que lo fuerce).
const restos = await page.evaluate(() => [...document.querySelectorAll('[data-view="catalog"]')]
  .filter((el) => el.offsetParent !== null)
  .map((el) => el.tagName + '.' + String(el.className).slice(0, 40)));
log('No queda NADA del catalogo visible', restos.length === 0, restos.join(' | ') || 'nada');
log('El banner azul del hero desaparece', await page.locator('.ntl-hero').isHidden());

// ---------- Las tarjetas: fotos y descripcion, no una lista ----------
const nCards = await page.locator('.ntl-pcard').count();
log('Pinta los 12 planes como tarjetas', nCards === 12, `${nCards}`);
const card = await page.evaluate(() => {
  const c = document.querySelector('.ntl-pcard');
  return {
    fotos: c.querySelectorAll('.ntl-pcard-cell img').length,
    titulo: !!c.querySelector('.ntl-pcard-title'),
    desc: (c.querySelector('.ntl-pcard-sub') || {}).textContent || '',
    meta: (c.querySelector('.ntl-pcard-meta') || {}).textContent || '',
  };
});
log('Cada tarjeta lleva varias fotos', card.fotos >= 3, `${card.fotos} fotos`);
log('Cada tarjeta lleva descripcion', card.titulo && card.desc.length > 15, JSON.stringify(card.desc));
log('Cada tarjeta lleva duracion, paradas y precio',
  /stops/.test(card.meta) && /from/.test(card.meta), JSON.stringify(card.meta));

// Las fotos de la tarjeta son las de sus propias paradas
const fotosOk = await page.evaluate(() => {
  const c = document.querySelector('.ntl-pcard');
  const pl = (window.NTL_PLANS || []).find((p) => p.id === c.dataset.plan);
  const srcs = [...c.querySelectorAll('.ntl-pcard-cell img')].map((i) => i.getAttribute('src'));
  const suyas = new Set(pl.pasos.map((s) => s.imagen));
  return srcs.every((s) => suyas.has(s));
});
log('Las fotos son las de sus paradas', fotosOk);

// ---------- Detalle de un plan ----------
await page.locator('.ntl-pcard').first().click();
await page.waitForTimeout(400);
log('Al elegir un plan se abre su detalle', await page.locator('#planDetail').isVisible());
log('Y desaparece la rejilla de tarjetas', await page.locator('#plansGrid').isHidden());
const pasos = await page.locator('.ntl-step').count();
log('El detalle muestra los pasos en orden', pasos >= 3, `${pasos} pasos`);
log('El detalle no lleva hero azul', await page.locator('.ntl-hero').isHidden());
log('El detalle usa las fotos del plan como portada', await page.locator('.ntl-pd-banner').isVisible());
log('La flecha pasa a "All plans"', (await page.textContent('#hdBackLabel')).trim() === 'All plans');
// Las paradas deben verse grandes: son el contenido principal de esta vista.
const tam = await page.evaluate(() => {
  const img = document.querySelector('.ntl-step-img').getBoundingClientRect();
  const t = getComputedStyle(document.querySelector('.ntl-step-title')).fontSize;
  return { ancho: Math.round(img.width), alto: Math.round(img.height), fuente: parseFloat(t) };
});
log('Las paradas se ven en tamano generoso', tam.ancho >= 120 && tam.fuente >= 16,
  `foto ${tam.ancho}x${tam.alto}px, titulo ${tam.fuente}px`);
const notas = await page.evaluate(() => {
  const s = [...document.querySelectorAll('.ntl-step')];
  return { total: s.length, con: s.filter((x) => x.querySelector('.ntl-step-note')).length };
});
log('Cada paso lleva nuestra nota', notas.con === notas.total, `${notas.con}/${notas.total}`);

// ---------- ATRIBUCION en los pasos ----------
const attr = await page.evaluate(() => {
  const as = [...document.querySelectorAll('.ntl-step a[href*="getyourguide."]')];
  return {
    total: as.length,
    cmp: as.filter((a) => a.href.includes('cmp=PRUEBA1')).length,
    pid: as.filter((a) => a.href.includes('partner_id=IBO5PAK')).length,
  };
});
log('Los pasos llevan cmp=PRUEBA1', attr.total > 0 && attr.cmp === attr.total, `${attr.cmp}/${attr.total}`);
log('Los pasos llevan partner_id', attr.pid === attr.total, `${attr.pid}/${attr.total}`);
const todos = await page.evaluate(() => {
  const as = [...document.querySelectorAll('a[href*="getyourguide."]')];
  return { total: as.length, cmp: as.filter((a) => a.href.includes('cmp=PRUEBA1')).length };
});
log('TODA la pagina mantiene la atribucion', todos.cmp === todos.total, `${todos.cmp}/${todos.total}`);
const validos = await page.evaluate(() => {
  const cat = new Set((window.NTL_CATALOG || []).map((a) => a.url.split('?')[0]));
  const st = [...document.querySelectorAll('.ntl-step a[href*="getyourguide."]')].map((a) => a.href.split('?')[0]);
  return { total: st.length, ok: st.filter((u) => cat.has(u)).length };
});
log('Los pasos existen en el catalogo', validos.ok === validos.total, `${validos.ok}/${validos.total}`);

// ---------- Widget de disponibilidad bajo demanda ----------
const nBtn = await page.locator('.ntl-step-dates').count();
log('Cada parada ofrece ver fechas y precio en vivo', nBtn >= 3, `${nBtn} botones`);
log('Ningun widget abierto de entrada', (await page.locator('.ntl-step-avail:not([hidden])').count()) === 0);

await page.locator('.ntl-step-dates').first().click();
await page.waitForTimeout(350);
const wid = await page.evaluate(() => {
  const d = document.querySelector('.ntl-step-avail:not([hidden]) [data-gyg-widget]');
  return d ? { tour: d.dataset.gygTourId, cmp: d.getAttribute('data-gyg-cmp'),
    widget: d.dataset.gygWidget, cur: d.dataset.gygCurrency } : null;
});
log('Inyecta el widget de disponibilidad de esa actividad',
  !!wid && wid.widget === 'availability' && /^\d+$/.test(wid.tour), JSON.stringify(wid));
log('El widget lleva el cmp del establecimiento', wid && wid.cmp === 'PRUEBA1', wid && wid.cmp);

// Solo uno abierto a la vez: son iframes y no conviene cargar tres.
await page.locator('.ntl-step-dates').nth(1).click();
await page.waitForTimeout(350);
log('Solo un widget abierto a la vez', (await page.locator('.ntl-step-avail:not([hidden])').count()) === 1);

// Red de seguridad: si GYG no monta el iframe, debe quedar un enlace util.
await page.waitForTimeout(3800);
const fb = await page.evaluate(() => {
  const a = document.querySelector('.ntl-avail-fallback');
  return a ? a.href : null;
});
log('Si el widget no monta, deja un enlace que si funciona',
  !!fb && fb.includes('partner_id=IBO5PAK') && fb.includes('cmp=PRUEBA1'), fb ? fb.slice(0, 90) : 'sin fallback');

// Cerrarlo para no dejar estado raro
await page.locator('.ntl-step-dates').nth(1).click();
await page.waitForTimeout(250);

// ---------- Volver ----------
await page.click('#hdBack');
await page.waitForTimeout(400);
log('La flecha de cabecera vuelve a las tarjetas', await page.locator('#plansGrid').isVisible()
  && (await page.locator('#planDetail').isHidden()));
await page.click('#hdBack');
await page.waitForTimeout(500);
log('La flecha de cabecera vuelve al catalogo', await page.locator('#experiencesContainer').isVisible()
  && (await page.locator('#ntlPlansView').isHidden()));
log('Y reaparece la barra de recomendaciones', await page.locator('#ntlHelper').isVisible());

// Al reentrar debe verse la rejilla, no el ultimo detalle abierto
await page.click('#btnPlans');
await page.waitForTimeout(400);
log('Al reentrar se ven las tarjetas, no el ultimo detalle',
  (await page.locator('#plansGrid').isVisible()) && (await page.locator('#planDetail').isHidden()));
await page.close();

// ---------- Orden por zona y hora ----------
const salou = await pageAt('2026-07-25T20:30:00');
await salou.goto(BASE + '?ref=EST-Z&zona=salou', { waitUntil: 'domcontentloaded' });
await salou.waitForTimeout(1000);
const primero = await salou.evaluate(() => {
  const el = document.querySelector('.ntl-pcard');
  return el ? el.dataset.plan : null;
});
log('Con QR de Salou, el plan de la zona va primero', primero === 'costa-daurada-48h', `primero=${primero}`);
await salou.close();

const manana = await pageAt('2026-07-25T09:00:00');
await manana.goto(BASE, { waitUntil: 'domcontentloaded' });
await manana.waitForTimeout(1000);
const pm = await manana.evaluate(() => {
  const c = document.querySelector('.ntl-pcard');
  const f = (window.NTL_PLANS || []).find((x) => x.id === (c && c.dataset.plan));
  return f ? f.momento : null;
});
log('Por la manana prioriza un plan de manana', Array.isArray(pm) && pm.includes('morning'), JSON.stringify(pm));
await manana.close();

// ---------- Movil ----------
const mob = await pageAt('2026-07-25T20:30:00', { width: 390, height: 844 });
await mob.goto(BASE + '?ref=PRUEBA1', { waitUntil: 'domcontentloaded' });
await mob.waitForTimeout(1200);
await mob.click('#btnPlans');
await mob.waitForTimeout(500);
const ov1 = await mob.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
log('Movil: tarjetas sin desbordamiento', ov1.s <= ov1.c + 1, `scrollW=${ov1.s} clientW=${ov1.c}`);
await mob.screenshot({ path: './capturas/plans-movil.png' });
await mob.locator('.ntl-pcard').first().click();
await mob.waitForTimeout(400);
const ov2 = await mob.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
log('Movil: detalle sin desbordamiento', ov2.s <= ov2.c + 1, `scrollW=${ov2.s} clientW=${ov2.c}`);
await mob.close();

// ---------- Sin planes ----------
const noP = await browser.newPage();
await noP.route('**/plans.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.NTL_PLANS=[];' }));
const noErr = [];
noP.on('pageerror', (e) => noErr.push(e.message));
await noP.goto(BASE, { waitUntil: 'domcontentloaded' });
await noP.waitForTimeout(900);
const sinPlanes = await noP.evaluate(() => ({
  boton: document.getElementById('btnPlans').hidden,
  vista: document.getElementById('ntlPlansView').hidden,
  barra: !document.getElementById('ntlHelper').hidden,
}));
log('Sin planes: se oculta el boton y la barra sigue',
  sinPlanes.boton && sinPlanes.vista && sinPlanes.barra && noErr.length === 0,
  JSON.stringify(sinPlanes) + ` errores=${noErr.length}`);
await noP.close();

log('Sin errores de JS', errs.length === 0, errs.slice(0, 2).join(' | ') || 'ninguno');

// Capturas. Producto secundario: si fallan (es la ultima de muchas paginas y a
// veces se atraganta) no pueden tumbar unas pruebas que ya han pasado.
try {
  const shot = await pageAt('2026-07-25T20:30:00');
  await shot.goto(BASE + '?ref=PRUEBA1&zona=salou', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await shot.waitForSelector('#btnPlans', { timeout: 20000 });
  await shot.click('#btnPlans');
  await shot.waitForSelector('.ntl-pcard', { timeout: 20000 });
  await shot.screenshot({ path: './capturas/plans.png' });
  await shot.locator('.ntl-pcard').first().click();
  await shot.waitForSelector('.ntl-step', { timeout: 20000 });
  await shot.screenshot({ path: './capturas/plan-detalle.png' });
  await shot.close();
} catch (e) {
  console.log('  (aviso: no se pudieron hacer las capturas -- ' + String(e.message).split('\n')[0] + ')');
}

await browser.close();
const bad = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - bad.length}/${results.length} pruebas OK ===`);
bad.forEach((b) => console.log(' FALLO: ' + b.n + ' -- ' + b.d));
