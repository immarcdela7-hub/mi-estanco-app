/* El recomendador y la hora que es.
   Nace de un fallo real: a las 23:33 de un domingo proponia una visita guiada a
   la Sagrada Familia y un alquiler de motos de agua. La regla que se comprueba
   aqui es una sola, y no admite excepciones: NADA de lo que se recomiende puede
   estar cerrado a la hora en que se propone empezar.

   El reloj del navegador se congela con addInitScript, asi la prueba da igual a
   que hora se ejecute. */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8099/tickets.html';
const ANTELACION_MIN = 120;

const results = [];
function log(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -- ' + detail : ''}`);
}

/** Congela el reloj del navegador en una fecha local concreta. */
function congelar(iso) {
  return `(() => {
    const fijo = new Date('${iso}').getTime();
    const Real = Date;
    class Falso extends Real {
      constructor(...a) { return a.length ? new Real(...a) : new Real(fijo); }
      static now() { return fijo; }
    }
    Falso.parse = Real.parse; Falso.UTC = Real.UTC;
    window.Date = Falso;
  })()`;
}

const browser = await chromium.launch();

async function abrir(iso, extra = '') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(congelar(iso));
  await page.goto(BASE + '?ref=EST-00012' + extra, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ntl-pick', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  return page;
}

/** Lo que se ve, mas los datos crudos de esas mismas actividades. */
async function leer(page) {
  return page.evaluate((antelacion) => {
    const cat = window.NTL_CATALOG || [];
    const porTitulo = new Map(cat.map((a) => [a.titulo, a]));
    const picks = [...document.querySelectorAll('.ntl-pick')].map((el) => {
      const t = el.querySelector('.ntl-pick-title').textContent.trim();
      const a = porTitulo.get(t) || {};
      return { titulo: t, motivo: el.querySelector('.ntl-pick-reason').textContent.trim(),
        abre: a.abre || '', cierra: a.cierra || '', franja: a.franja || '' };
    });
    const ahora = new Date();
    const contexto = document.getElementById('picksContext').textContent.trim();
    // La hora que se comprueba es la que la propia web dice estar proponiendo:
    // dentro de dos horas, o manana a las 10:00 si ya no da tiempo a nada hoy.
    const manana = /tomorrow/i.test(contexto);
    const objetivo = manana
      ? 10 * 60
      : (ahora.getHours() * 60 + ahora.getMinutes() + antelacion) % 1440;
    return {
      contexto,
      picks,
      manana,
      objetivo,
      sinHorario: cat.filter((a) => !a.abre || !a.cierra).length,
      total: cat.length,
    };
  }, ANTELACION_MIN);
}

const min = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};
function abiertoA(p, t) {
  const a = min(p.abre), c = min(p.cierra);
  if (a === null || c === null) return null;
  return c > a ? t >= a && t <= c : t >= a || t <= c;
}

// ---------- 0. El catalogo trae los horarios ----------
{
  const page = await abrir('2026-08-03T12:00:00');
  const d = await leer(page);
  log('Todas las actividades tienen ventana horaria', d.sinHorario === 0,
    `${d.sinHorario} sin horario de ${d.total}`);
  await page.close();
}

// ---------- 1. LA PRUEBA QUE NUNCA DEBE FALLAR ----------
// A cada hora del dia, lo recomendado tiene que estar abierto a la hora en que
// se propone empezar. Un solo fallo aqui es un cliente en una puerta cerrada.
const HORAS = ['07:15', '09:00', '11:30', '14:00', '16:45', '19:00', '20:30', '22:00', '23:33', '02:10'];
let cerradas = [];
for (const h of HORAS) {
  const page = await abrir(`2026-08-03T${h}:00`);
  const d = await leer(page);
  const malas = d.picks.filter((p) => abiertoA(p, d.objetivo) === false);
  if (malas.length) {
    cerradas.push(`${h}${d.manana ? ' (manana)' : ''} -> ` +
      malas.map((m) => `${m.titulo} (${m.abre}-${m.cierra})`).join('; '));
  }
  if (d.picks.length !== 3) cerradas.push(`${h} -> solo ${d.picks.length} recomendaciones`);
  await page.close();
}
log('Nunca se recomienda algo cerrado a la hora que se propone', cerradas.length === 0,
  cerradas.length ? cerradas[0] : `${HORAS.length} horas comprobadas, 3 tarjetas cada una`);

// ---------- 2. Las dos horas de antelacion ----------
{
  // A las 17:30 se planifica para las 19:30: entra lo de tarde-noche, aunque
  // a las 17:30 en punto todavia fuese "por la tarde".
  const page = await abrir('2026-08-03T17:30:00');
  const d = await leer(page);
  const todasAbiertasA1930 = d.picks.every((p) => abiertoA(p, 19 * 60 + 30) === true);
  log('Se planifica para dentro de dos horas, no para ahora',
    d.objetivo === 19 * 60 + 30 && todasAbiertasA1930,
    `objetivo=${Math.floor(d.objetivo / 60)}:${String(d.objetivo % 60).padStart(2, '0')} · ` +
    d.picks.map((p) => `${p.abre}-${p.cierra}`).join(' '));
  await page.close();
}

// ---------- 3. De noche: se pasa a manana, y se dice ----------
{
  const page = await abrir('2026-08-03T23:33:00');
  const d = await leer(page);
  log('A las 23:33 avisa de que ya es tarde', /tomorrow/i.test(d.contexto), d.contexto);
  log('Lo de manana esta abierto a las 10:00',
    d.picks.every((p) => abiertoA(p, 10 * 60) === true),
    d.picks.map((p) => `${p.titulo.slice(0, 30)} [${p.franja} ${p.abre}-${p.cierra}]`).join(' | '));
  // El fallo original, dicho con precision: no era enseñar la Sagrada Familia
  // a las 23:33 —como plan de manana es una buena idea—, era enseñarla
  // diciendo "esto es lo que hariamos ESTA NOCHE". Lo que no puede pasar es
  // proponer algo de dia sin avisar de que es para manana.
  const hayDeDia = d.picks.some((p) => p.franja === 'dia');
  log('Si propone algo de dia, avisa de que es para manana',
    !hayDeDia || d.manana === true,
    `de dia=${hayDeDia}, avisa=${d.manana} · ` + d.picks.map((p) => p.franja).join('/'));
  await page.close();
}

// ---------- 3b. La regla, a lo largo de toda la noche ----------
{
  // El texto y las tarjetas tienen que contar lo mismo. A las 05:30 proponer
  // la salida de las 07:30 a Andorra es correcto: el dia empieza, y el texto
  // dice "this morning". Lo que no puede pasar es decir "tonight" y enseñar
  // museos, que es literalmente el fallo del que salio todo esto.
  const fallos = [];
  for (const h of ['21:00', '22:00', '23:00', '23:33', '00:45', '03:00', '05:30']) {
    const page = await abrir(`2026-08-03T${h}:00`);
    const d = await leer(page);
    const diceNoche = /tonight/i.test(d.contexto);
    if (diceNoche && d.picks.some((p) => p.franja === 'dia')) {
      fallos.push(`${h}: dice "tonight" con actividades de dia`);
    }
    if (d.picks.some((p) => abiertoA(p, d.objetivo) === false)) fallos.push(`${h}: algo cerrado`);
    if (d.picks.length !== 3) fallos.push(`${h}: ${d.picks.length} tarjetas`);
    await page.close();
  }
  log('El texto y las tarjetas cuentan lo mismo toda la noche', fallos.length === 0,
    fallos.length ? fallos.join(' | ') : '7 horas nocturnas comprobadas');
}

// ---------- 4. De dia NO avisa de manana ----------
{
  const page = await abrir('2026-08-03T10:00:00');
  const d = await leer(page);
  log('A las 10:00 recomienda para hoy', !/tomorrow/i.test(d.contexto), d.contexto);
  await page.close();
}

// ---------- 5. A las 21:00 hay vida nocturna ----------
{
  const page = await abrir('2026-08-03T21:00:00');
  const d = await leer(page);
  const hayNoche = d.picks.some((p) => p.franja === 'noche' || p.franja === 'tarde');
  log('A las 21:00 sigue habiendo plan para hoy',
    !/tomorrow/i.test(d.contexto) && hayNoche,
    d.picks.map((p) => `${p.franja} ${p.abre}-${p.cierra}`).join(' | '));
  await page.close();
}

// ---------- 6. "Surprise me" respeta la hora ----------
{
  const page = await abrir('2026-08-03T22:00:00');
  let fallos = 0;
  for (let i = 0; i < 6; i++) {
    await page.click('#btnSurprise');
    await page.waitForTimeout(180);
    const d = await leer(page);
    if (d.picks.some((p) => abiertoA(p, d.objetivo) === false)) fallos++;
  }
  log('"Surprise me" tampoco propone nada cerrado', fallos === 0, `${fallos}/6 tiradas con algo cerrado`);
  await page.close();
}

// ---------- 7. La zona del QR sigue mandando dentro de lo abierto ----------
{
  const page = await abrir('2026-08-03T11:00:00', '&zona=salou');
  const d = await leer(page);
  log('Con ?zona= sigue recomendando de la zona y abierto',
    d.picks.every((p) => abiertoA(p, d.objetivo) === true) && /Salou/i.test(d.contexto),
    d.contexto);
  await page.close();
}

// ---------- 8. La atribucion, en las dos ramas ----------
for (const [h, etiqueta] of [['12:00', 'de dia'], ['23:33', 'de madrugada']]) {
  const page = await abrir(`2026-08-03T${h}:00`);
  const at = await page.evaluate(() => {
    const as = [...document.querySelectorAll('.ntl-pick[href*="getyourguide."]')];
    return { total: as.length, conCmp: as.filter((a) => a.href.includes('cmp=EST-00012')).length };
  });
  log(`Las recomendaciones ${etiqueta} llevan su cmp`,
    at.total > 0 && at.conCmp === at.total, `${at.conCmp}/${at.total}`);
  await page.close();
}

// ---------- 9. Sin horarios en el catalogo no se rompe ----------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(congelar('2026-08-03T23:33:00'));
  await page.addInitScript(() => {
    // Simula un catalogo antiguo, sin la columna nueva.
    Object.defineProperty(window, 'NTL_CATALOG', {
      configurable: true,
      set(v) {
        this._c = (v || []).map((a) => { const b = Object.assign({}, a); delete b.abre; delete b.cierra; return b; });
      },
      get() { return this._c; },
    });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const n = await page.locator('.ntl-pick').count();
  log('Sin horarios sigue recomendando algo, y sin errores', n === 3 && errs.length === 0,
    `${n} tarjetas, ${errs.length} errores`);
  await page.close();
}

await browser.close();
const fallos = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - fallos.length}/${results.length} pruebas OK ===`);
if (fallos.length) {
  console.log('FALLOS:');
  fallos.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail));
  process.exitCode = 1;
}
