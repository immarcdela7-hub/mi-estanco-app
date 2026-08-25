/* Zonas: que el QR de un bar de Reus ensene cosas de Reus y de su entorno.

   Lo que se vigila aqui, por orden de importancia:
   1. Que ninguna actividad haya cambiado de `city` para encajar en una zona. Es
      la linea que no se cruza: el cliente paga y viaja, y si la tarjeta miente
      sobre donde es, se planta en el sitio equivocado.
   2. Que ?zona=<ciudad> deje algo que ensenar, y que lo DE la ciudad salga
      primero.
   3. Que zona=costadaurada siga funcionando despues de quitar el apano que
      estaba escrito en el codigo.
   4. Que nada de esto haya dejado un enlace sin cmp. */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsv } from '../lib/csv.mjs';

const BASE = 'http://127.0.0.1:8099/tickets.html';
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const MINIMO = 10;

const results = [];
function log(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -- ' + detail : ''}`);
}

const tid = (u) => (String(u).match(/-t(\d+)/) || [])[1] || '';

// ---------- 1. Ninguna fila existente ha cambiado de city ----------
// Se compara contra el CSV del ultimo commit: las filas que ya existian tienen
// que conservar su city exacto. Las nuevas, obviamente, no estaban.
{
  const ahora = parseCsv(readFileSync(path.join(ROOT, 'web', 'catalog.csv'), 'utf8')).records;
  let antes = null;
  try {
    const txt = execFileSync('git', ['show', 'HEAD:web/catalog.csv'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    antes = parseCsv(txt).records;
  } catch { /* sin git no se puede comparar */ }

  if (!antes) {
    log('Comparacion con el CSV anterior', false, 'no se pudo leer HEAD:web/catalog.csv');
  } else {
    const cityAntes = new Map(antes.map((r) => [tid(r.url_getyourguide), (r.city || '').trim().toLowerCase()]));
    const cambiadas = [];
    for (const r of ahora) {
      const t = tid(r.url_getyourguide);
      if (!cityAntes.has(t)) continue;                    // fila nueva
      const c = (r.city || '').trim().toLowerCase();
      if (c !== cityAntes.get(t)) cambiadas.push(`t${t}: ${cityAntes.get(t)} -> ${c}`);
    }
    log('Ninguna actividad existente ha cambiado su city',
      cambiadas.length === 0,
      `${antes.length} filas antes, ${ahora.length} ahora; cambiadas: ${cambiadas.length}` +
      (cambiadas.length ? ' | ' + cambiadas.slice(0, 3).join(' , ') : ''));

    // Y una zona nunca puede repetir la propia ciudad de la actividad.
    const repes = ahora.filter((r) => (r.zonas || '').split('|').filter(Boolean)
      .includes((r.city || '').trim().toLowerCase()));
    log('Ninguna actividad se lista a si misma en zonas', repes.length === 0,
      repes.slice(0, 3).map((r) => r.city).join(', ') || 'ninguna');
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errores = [];
page.on('pageerror', (e) => errores.push(e.message));

async function verZona(zona, ref = 'EST-00012') {
  await page.goto(`${BASE}?ref=${ref}&zona=${zona}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 'attached' y no 'visible': con una zona filtrada la primera tarjeta del DOM
  // suele estar oculta, y esperar a que se vea no termina nunca.
  await page.waitForSelector('.experience-item', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(1000);
  return page.evaluate(() => {
    const vis = [...document.querySelectorAll('.experience-item')]
      .filter((e) => e.offsetParent !== null);
    // Con una zona desconocida no se filtra nada, asi que la pagina cae en la
    // vista por temas y el grid queda detras de "See all". Se cuentan las dos
    // cosas: lo que importa es que al visitante se le siga ofreciendo algo.
    const enFilas = [...document.querySelectorAll('.ntl-rowcard')]
      .filter((e) => e.offsetParent !== null).length;
    return {
      visibles: vis.length,
      enFilas,
      ciudades: vis.map((e) => e.dataset.city),
      provincia: (document.querySelector('.province-btn.active') || {}).dataset?.province || null,
    };
  });
}

// ---------- 2. Tres ciudades distintas: hay oferta y lo suyo va primero ----------
for (const zona of ['reus', 'terrassa', 'cornella-de-llobregat']) {
  const r = await verZona(zona);
  log(`Zona "${zona}" deja al menos ${MINIMO} tarjetas`, r.visibles >= MINIMO,
    `${r.visibles} visibles (provincia ${r.provincia})`);

  const propias = r.ciudades.filter((c) => c === zona).length;
  if (propias > 0) {
    // Todas las de la ciudad tienen que ir antes que cualquier otra.
    const ultimaPropia = r.ciudades.lastIndexOf(zona);
    const primeraAjena = r.ciudades.findIndex((c) => c !== zona);
    log(`En "${zona}" lo suyo sale primero`,
      primeraAjena === -1 || ultimaPropia < primeraAjena,
      `${propias} propias; ultima propia en ${ultimaPropia}, primera de fuera en ${primeraAjena}`);
  } else {
    log(`En "${zona}" lo suyo sale primero`, true, 'no tiene oferta propia: todo son alrededores');
  }
}

// ---------- 3. costadaurada sigue funcionando sin el apano del codigo ----------
{
  const r = await verZona('costadaurada');
  const soloCostaDaurada = r.ciudades.every((c) => ['salou', 'cambrils'].includes(c));
  log('zona=costadaurada sigue filtrando Salou y Cambrils',
    r.visibles > 0 && soloCostaDaurada && r.provincia === 'tarragona',
    `${r.visibles} visibles, ciudades: ${[...new Set(r.ciudades)].join(', ')}, provincia ${r.provincia}`);
}

// ---------- 4. La atribucion no se rompe en ninguna zona ----------
{
  await page.goto(`${BASE}?ref=PRUEBA1&zona=reus`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.experience-item', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(700);
  const atrib = await page.evaluate(() => {
    const as = [...document.querySelectorAll('.experience-item a[href*="getyourguide."]')];
    return {
      total: as.length,
      conCmp: as.filter((a) => /[?&]cmp=PRUEBA1(&|$)/.test(a.href)).length,
      conPartner: as.filter((a) => a.href.includes('partner_id=IBO5PAK')).length,
    };
  });
  log('Con ?zona= todas las tarjetas conservan su cmp',
    atrib.total > 0 && atrib.conCmp === atrib.total, `${atrib.conCmp}/${atrib.total}`);
  log('Y su partner_id', atrib.conPartner === atrib.total, `${atrib.conPartner}/${atrib.total}`);
}

// ---------- 5. Una zona que no existe no rompe nada ----------
{
  const r = await verZona('villarriba-de-abajo');
  log('Una zona desconocida no deja la pagina vacia', r.visibles + r.enFilas > 0,
    `${r.visibles} en el grid, ${r.enFilas} en las filas por tema`);
}

log('Sin errores de JS en consola', errores.length === 0, errores.slice(0, 3).join(' | ') || 'ninguno');

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} pruebas OK ===`);
if (failed.length) { console.log('FALLOS:'); failed.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail)); }
