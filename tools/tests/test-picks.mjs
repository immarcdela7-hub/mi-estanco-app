import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8099/tickets.html';
const browser = await chromium.launch();
const results = [];
const log = (n, p, d) => { results.push({ n, p, d }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? ' -- ' + d : ''}`); };

// Congela la hora del navegador para probar cada franja horaria.
async function pageAt(iso, viewport = { width: 1280, height: 900 }) {
  const p = await browser.newPage({ viewport });
  await p.addInitScript(`(() => {
    const F = new Date('${iso}').getTime();
    const OD = Date;
    class D extends OD { constructor(...a){ if(!a.length) super(F); else super(...a); } static now(){ return F; } }
    window.Date = D;
  })()`);
  return p;
}

// La barra ya no se pliega: esta siempre visible.
async function openHelper() { /* no-op: la barra ya no tiene boton de ocultar */ }

// ---------- 1. Barra plegada y recomendaciones ----------
const page = await pageAt('2026-07-25T20:30:00');
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/getyourguide|net::|ERR_/i.test(m.text())) errs.push(m.text()); });
await page.goto(BASE + '?ref=PRUEBA1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

log('La barra de ayuda se muestra', await page.locator('#ntlHelper').isVisible());
log('Las recomendaciones se ven sin pulsar nada', await page.locator('#picksGrid').isVisible());
log('Ya no hay boton de ocultar', (await page.locator('#helperToggle').count()) === 0);
log('Hay acceso a los planes', await page.locator('#btnPlans').isVisible());
const nPicks = await page.locator('.ntl-pick').count();
log('Recomienda exactamente 3', nPicks === 3, `${nPicks}`);

// ---------- 2. ATRIBUCION ----------
const attr = await page.evaluate(() => {
  const as = [...document.querySelectorAll('.ntl-pick')];
  return {
    total: as.length,
    cmp: as.filter((a) => a.href.includes('cmp=PRUEBA1')).length,
    pid: as.filter((a) => a.href.includes('partner_id=IBO5PAK')).length,
  };
});
log('Recomendaciones con cmp=PRUEBA1', attr.total > 0 && attr.cmp === attr.total, `${attr.cmp}/${attr.total}`);
log('Recomendaciones con partner_id', attr.pid === attr.total, `${attr.pid}/${attr.total}`);

const all = await page.evaluate(() => {
  const as = [...document.querySelectorAll('a[href*="getyourguide."]')];
  return { total: as.length, cmp: as.filter((a) => a.href.includes('cmp=PRUEBA1')).length };
});
log('TODA la pagina mantiene la atribucion', all.cmp === all.total && all.total >= 104, `${all.cmp}/${all.total}`);

// ---------- 3. Diversidad ----------
const cats = await page.evaluate(() => [...document.querySelectorAll('.ntl-pick')].map((a) => a.href));
log('Las 3 recomendaciones son distintas', new Set(cats).size === 3, `${new Set(cats).size} unicas`);

// ---------- 4. "Surprise me" ----------
const before = await page.evaluate(() => [...document.querySelectorAll('.ntl-pick')].map((a) => a.href).join('|'));
let changed = false;
for (let i = 0; i < 6 && !changed; i++) {
  await page.click('#btnSurprise');
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => [...document.querySelectorAll('.ntl-pick')].map((a) => a.href).join('|'));
  if (after !== before) changed = true;
}
log('"Surprise me" cambia las recomendaciones', changed);
const afterAttr = await page.evaluate(() => {
  const as = [...document.querySelectorAll('.ntl-pick')];
  return { t: as.length, c: as.filter((a) => a.href.includes('cmp=PRUEBA1')).length };
});
log('Tras "Surprise me" sigue habiendo atribucion', afterAttr.t > 0 && afterAttr.c === afterAttr.t, `${afterAttr.c}/${afterAttr.t}`);

// ---------- 5. Contexto horario ----------
const nightCtx = await page.textContent('#picksContext');
log('El contexto se lee en la barra', /tonight/i.test(nightCtx || ''), JSON.stringify(nightCtx));
await page.close();

const morning = await pageAt('2026-07-25T09:00:00');
await morning.goto(BASE, { waitUntil: 'domcontentloaded' });
await morning.waitForTimeout(1000);
log('Texto de contexto por la manana', /this morning/i.test((await morning.textContent('#picksContext')) || ''));
await morning.close();

// ---------- 7. Zona del cartel QR ----------
const salou = await pageAt('2026-07-25T20:30:00');
await salou.goto(BASE + '?ref=EST-TEST&zona=salou', { waitUntil: 'domcontentloaded' });
await salou.waitForTimeout(1200);
const sCtx = await salou.textContent('#picksContext');
log('El contexto nombra la zona del QR', /salou/i.test(sCtx || ''), JSON.stringify(sCtx));
const nearby = await salou.evaluate(() => {
  const urls = [...document.querySelectorAll('.ntl-pick')].map((a) => a.href);
  const byUrl = new Map((window.NTL_CATALOG || []).map((a) => [a.url.split('?')[0], a]));
  return urls.map((u) => { const m = byUrl.get(u.split('?')[0]); return m ? m.city : '?'; });
});
log('Prioriza actividades de la zona', nearby.filter((c) => c === 'salou' || c === 'cambrils').length >= 2, nearby.join(', '));
await salou.close();

// ---------- 8. Sin repetir sitio ni motivo ----------
const salou2 = await pageAt('2026-07-25T20:30:00');
await salou2.goto(BASE + '?ref=EST-TEST&zona=salou', { waitUntil: 'domcontentloaded' });
await salou2.waitForTimeout(1200);
const places = await salou2.evaluate(() => [...new Set((window.NTL_CATALOG || [])
  .flatMap((a) => [String(a.city || ''), String(a.provincia || '')]))].map((s) => s.toLowerCase()).filter(Boolean));
// Usamos la MISMA lista de palabras genericas que recommend.js, leyendola del
// propio codigo: si la prueba tuviera su propia lista se desincronizarian y
// daria falsos positivos (p. ej. "experience" aparece en decenas de titulos).
const { readFileSync } = await import('node:fs');
const stopSrc = readFileSync(new URL('../../web/recommend.js', import.meta.url), 'utf8');
const STOP = JSON.parse('[' + stopSrc.match(/var STOP = \[([\s\S]*?)\];/)[1].replace(/'/g, '"') + ']')
  .map((s) => s.trim());
const key = (t) => t.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 5 &&
  !STOP.includes(w) && !places.includes(w));
let dupVenue = 0, dupReason = 0, rounds = 0;
for (let i = 0; i < 12; i++) {
  const st = await salou2.evaluate(() => ({
    titles: [...document.querySelectorAll('.ntl-pick-title')].map((e) => e.textContent.trim()),
    reasons: [...document.querySelectorAll('.ntl-pick-reason')].map((e) => e.textContent.trim()),
  }));
  rounds++;
  const seen = new Set(); let clash = false;
  for (const t of st.titles) for (const w of key(t)) { if (seen.has(w)) clash = true; seen.add(w); }
  if (clash) dupVenue++;
  if (new Set(st.reasons).size !== st.reasons.length) dupReason++;
  await salou2.click('#btnSurprise');
  await salou2.waitForTimeout(180);
}
log('Nunca repite el mismo sitio en las 3', dupVenue === 0, `${dupVenue}/${rounds} rondas`);
log('Nunca repite el mismo motivo', dupReason === 0, `${dupReason}/${rounds} rondas`);
await salou2.close();

// ---------- 9. Ciudades del CRM fuera del mapa fijo ----------
for (const [zona, esperado] of [['lloret-de-mar', 'girona'], ['sitges', 'barcelona'], ['tossa-de-mar', 'girona']]) {
  const pz = await pageAt('2026-07-25T20:30:00');
  await pz.goto(BASE + `?ref=EST-Z&zona=${zona}`, { waitUntil: 'domcontentloaded' });
  // Esperar a que el contexto tenga texto, no un tiempo fijo: con 125 tarjetas
  // el render tarda mas y 1 s dejaba la primera vuelta en blanco.
  await pz.waitForFunction(() => {
    const e = document.getElementById('picksContext');
    return e && e.textContent.trim().length > 0;
  }, { timeout: 15000 }).catch(() => {});
  const txt = await pz.textContent('#picksContext');
  const prov = await pz.evaluate(() => {
    const b = document.querySelector('.province-btn.active');
    return b ? b.dataset.province : null;
  });
  const nom = zona.replace(/-/g, ' ').toLowerCase();
  log(`Zona "${zona}" reconocida`, (txt || '').toLowerCase().includes(nom) && prov === esperado,
    `contexto=${JSON.stringify(txt)} provincia=${prov}`);
  await pz.close();
}

const pAcc = await pageAt('2026-07-25T20:30:00');
await pAcc.goto(BASE + '?ref=EST-Z&zona=' + encodeURIComponent('Lloret de Mar'), { waitUntil: 'domcontentloaded' });
await pAcc.waitForTimeout(1000);
log('Acepta la ciudad con espacios/mayusculas', /Lloret/i.test((await pAcc.textContent('#picksContext')) || ''));
await pAcc.close();

const pUnk = await pageAt('2026-07-25T20:30:00');
const unkErr = [];
pUnk.on('pageerror', (e) => unkErr.push(e.message));
await pUnk.goto(BASE + '?ref=EST-Z&zona=cuenca', { waitUntil: 'domcontentloaded' });
await pUnk.waitForTimeout(1000);
const unkVis = await pUnk.evaluate(() =>
  [...document.querySelectorAll('.experience-item:not(.ntl-own)')].filter((e) => e.offsetParent !== null).length);
log('Ciudad desconocida no rompe nada', unkVis === 125 && unkErr.length === 0, `${unkVis} visibles, ${unkErr.length} errores`);
await pUnk.close();

// ---------- 10. Movil ----------
const mob = await pageAt('2026-07-25T20:30:00', { width: 390, height: 844 });
await mob.goto(BASE + '?ref=PRUEBA1', { waitUntil: 'domcontentloaded' });
await mob.waitForTimeout(1200);
await mob.screenshot({ path: './capturas/movil-plegado.png' });
const ov = await mob.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
log('Movil 390px sin desbordamiento', ov.s <= ov.c + 1, `scrollW=${ov.s} clientW=${ov.c}`);
log('Movil muestra las 3 recomendaciones', (await mob.locator('.ntl-pick').count()) === 3);
await mob.screenshot({ path: './capturas/picks-movil.png' });
await mob.close();

// ---------- 11. Sin catalogo ----------
const noCat = await browser.newPage();
await noCat.route('**/catalog.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.NTL_CATALOG=[];' }));
const noErrs = [];
noCat.on('pageerror', (e) => noErrs.push(e.message));
await noCat.goto(BASE, { waitUntil: 'domcontentloaded' });
await noCat.waitForTimeout(900);
// Sin catalogo no hay recomendaciones, pero los planes siguen: la barra debe
// seguir apareciendo y abrirse directamente en la pestana de planes.
const sinCat = await noCat.evaluate(() => ({
  barra: document.getElementById('ntlHelper').hidden,
  picks: document.querySelectorAll('.ntl-pick').length,
}));
log('Sin catalogo: la barra se oculta y no rompe', sinCat.barra && sinCat.picks === 0 && noErrs.length === 0,
  JSON.stringify(sinCat) + ` errores=${noErrs.length}`);
await noCat.close();

log('Sin errores de JS', errs.length === 0, errs.slice(0, 2).join(' | ') || 'ninguno');

// Capturas. Son un producto secundario: si fallan (esta es la pagina numero 15
// que abre la bateria y a veces se atraganta), no pueden tumbar el resultado de
// unas pruebas que ya han pasado.
try {
  const shot = await pageAt('2026-07-25T20:30:00');
  await shot.goto(BASE + '?ref=PRUEBA1&zona=salou', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await shot.waitForSelector('#ntlHelper', { timeout: 20000 });
  await shot.screenshot({ path: './capturas/plegado.png' });
  await shot.locator('#ntlHelper').screenshot({ path: './capturas/picks.png' });
  await shot.close();
} catch (e) {
  console.log('  (aviso: no se pudieron hacer las capturas -- ' + String(e.message).split('\n')[0] + ')');
}

await browser.close();
const bad = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - bad.length}/${results.length} pruebas OK ===`);
bad.forEach((b) => console.log(' FALLO: ' + b.n + ' -- ' + b.d));
