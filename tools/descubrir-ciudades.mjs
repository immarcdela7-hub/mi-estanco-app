// ¿Tiene GetYourGuide oferta propia en cada municipio de mas de 50.000
// habitantes? Se comprueba con Chrome real (GYG responde 403 sin navegador) y se
// anota tambien el "no tiene": lo que no exista no se rellena a ojo.
//
// Como se decide: se busca la ciudad en GYG y se miran las localidades de los
// resultados. Las URLs son /{localidad-lID}/{actividad-tID}/, asi que si entre
// ellas aparece la propia ciudad, es que tiene oferta.
//
// Salida: tools/ciudades-gyg.json
//
//   node descubrir-ciudades.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MUN = path.join(ROOT, 'tools', 'municipios.json');
const HARVEST = path.join(ROOT, 'tools', 'harvest.json');
const OUT = path.join(ROOT, 'tools', 'ciudades-gyg.json');
const PROFILE = path.join(ROOT, 'tools', '.pw-profile');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = (loc) => String(loc).replace(/-l\d+$/, '').replace(/-spain$/, '');

const municipios = JSON.parse(readFileSync(MUN, 'utf8')).municipios;

// Lo que ya sabemos de la cosecha de la fase 1: si una ciudad tiene actividades
// alli, no hace falta preguntarle a GYG otra vez.
const yaConocidas = new Map();
if (existsSync(HARVEST)) {
  for (const a of JSON.parse(readFileSync(HARVEST, 'utf8'))) {
    const b = base(a.loc);
    if (!yaConocidas.has(b)) yaConocidas.set(b, { loc: a.loc, n: 0 });
    yaConocidas.get(b).n++;
  }
}

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome', headless: false, viewport: { width: 1366, height: 900 }, locale: 'en-US',
  args: ['--disable-blink-features=AutomationControlled'],
});
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
const page = ctx.pages()[0] || (await ctx.newPage());

const resultado = [];
for (let i = 0; i < municipios.length; i++) {
  const m = municipios[i];
  const conocida = yaConocidas.get(m.slug);
  if (conocida) {
    resultado.push({ ...m, gyg_loc: conocida.loc, actividades_cosechadas: conocida.n, comprobado: 'cosecha fase 1' });
    console.log(`[${i + 1}/${municipios.length}] ${m.slug.padEnd(28)} GYG: ${conocida.loc} (${conocida.n} act.)`);
    continue;
  }
  try {
    const url = 'https://www.getyourguide.com/s/?q=' + encodeURIComponent(m.nombre + ' Catalonia');
    const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(4500);
    const locs = await page.evaluate(() => {
      const c = {};
      document.querySelectorAll('a[href]').forEach((a) => {
        const mm = (a.getAttribute('href') || '').match(/\/([a-z0-9-]+-l\d+)\//i);
        if (mm) c[mm[1]] = (c[mm[1]] || 0) + 1;
      });
      return c;
    });
    const propia = Object.keys(locs).find((l) => base(l) === m.slug);
    resultado.push({
      ...m,
      gyg_loc: propia || null,
      actividades_cosechadas: 0,
      comprobado: 'busqueda en GYG',
      localidades_que_ofrece: Object.entries(locs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l, n]) => `${l} (${n})`),
      status: r ? r.status() : 0,
    });
    console.log(`[${i + 1}/${municipios.length}] ${m.slug.padEnd(28)} ${propia ? 'GYG: ' + propia : 'SIN oferta propia -> ' + (Object.keys(locs)[0] || 'nada')}`);
  } catch (e) {
    resultado.push({ ...m, gyg_loc: null, comprobado: 'error', error: String(e.message).slice(0, 80) });
    console.log(`[${i + 1}/${municipios.length}] ${m.slug.padEnd(28)} ERROR`);
  }
  writeFileSync(OUT, JSON.stringify(resultado, null, 1), 'utf8');
  await sleep(5000 + Math.random() * 3000);
}
await ctx.close();
writeFileSync(OUT, JSON.stringify(resultado, null, 1), 'utf8');

const con = resultado.filter((x) => x.gyg_loc);
console.log(`\n${con.length}/${resultado.length} municipios tienen oferta propia en GetYourGuide`);
console.log('sin oferta propia:', resultado.filter((x) => !x.gyg_loc).map((x) => x.slug).join(', '));
