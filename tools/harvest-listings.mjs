// Cosecha URLs REALES de actividades desde las paginas de listado de GetYourGuide,
// con Chrome real y pausas humanas (GYG responde 403 a peticiones sin navegador).
//
// Ademas de la URL, guarda las SEÑALES DE POPULARIDAD que GYG si publica, que son
// la base para decidir el top 50 (GYG no publica ventas):
//   - posicion en el listado  -> su orden por defecto es por popularidad
//   - nº de reseñas           -> el mejor proxy de volumen que existe
//   - distintivos propios     -> Bestseller, Likely to sell out, Top pick...
//   - valoracion
//
// Salida: tools/harvest.json (un registro por actividad, con todos los listados
// en los que aparece). Es el fichero auditable: de ahi sale el top 50.
//
//   node harvest-listings.mjs                  # todos los listados
//   node harvest-listings.mjs --solo=barcelona # uno suelto (para probar)
import { chromium } from 'playwright';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'tools', 'harvest.json');
const PROFILE = path.join(ROOT, 'tools', '.pw-profile');

// Toda Cataluña, no solo Barcelona: tenemos carteles en Salou, Cambrils, Girona
// y Lloret, y a ese turista no le sirve un top de Barcelona.
// Los ids (-lNNN) estan verificados contra URLs reales cosechadas antes.
const LISTINGS = [
  { url: 'https://www.getyourguide.com/barcelona-l45/', tag: 'barcelona' },
  { url: 'https://www.getyourguide.com/catalonia-l641/', tag: 'catalonia' },
  { url: 'https://www.getyourguide.com/girona-l550/', tag: 'girona' },
  { url: 'https://www.getyourguide.com/salou-l1884/', tag: 'salou' },
  { url: 'https://www.getyourguide.com/cambrils-l91400/', tag: 'cambrils' },
  { url: 'https://www.getyourguide.com/lloret-de-mar-l2322/', tag: 'lloret' },
  { url: 'https://www.getyourguide.com/tossa-de-mar-l90930/', tag: 'tossa' },
  { url: 'https://www.getyourguide.com/tarragona-l2419/', tag: 'tarragona' },
  { url: 'https://www.getyourguide.com/sitges-l1769/', tag: 'sitges' },
  { url: 'https://www.getyourguide.com/figueres-l4723/', tag: 'figueres' },
  { url: 'https://www.getyourguide.com/roses-spain-l92004/', tag: 'roses' },
  { url: 'https://www.getyourguide.com/costa-brava-l473/', tag: 'costabrava' },
  { url: 'https://www.getyourguide.com/lleida-l100032/', tag: 'lleida' },
  { url: 'https://www.getyourguide.com/montserrat-l2452/', tag: 'montserrat' },
  { url: 'https://www.getyourguide.com/portaventura-park-l89907/', tag: 'portaventura' },
  { url: 'https://www.getyourguide.com/costa-daurada-l144442/', tag: 'costadaurada' },
  { url: 'https://www.getyourguide.com/sant-cugat-del-valles-l154613/', tag: 'sant-cugat' },
  { url: 'https://www.getyourguide.com/reus-l148575/', tag: 'reus' },
  { url: 'https://www.getyourguide.com/vilanova-i-la-geltru-l157323/', tag: 'vilanova' },
  { url: 'https://www.getyourguide.com/castelldefels-l102102/', tag: 'castelldefels' },
  { url: 'https://www.getyourguide.com/tarragona-l1293/', tag: 'tarragona-ciudad' },
];

const SOLO = (process.argv.find((a) => a.startsWith('--solo=')) || '').split('=')[1];
const objetivo = SOLO ? LISTINGS.filter((l) => l.tag === SOLO) : LISTINGS;
// Cuantas veces pulsar "Show more" por listado (cada clic añade ~27 tarjetas).
const MAS_CLICS = parseInt((process.argv.find((a) => a.startsWith('--mas=')) || '--mas=4').split('=')[1], 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome', headless: false, viewport: { width: 1366, height: 900 }, locale: 'en-US',
  args: ['--disable-blink-features=AutomationControlled'],
});
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
const page = ctx.pages()[0] || (await ctx.newPage());

// Arranca de lo ya cosechado: asi se puede reanudar sin perder trabajo.
const all = existsSync(OUT)
  ? Object.fromEntries(JSON.parse(readFileSync(OUT, 'utf8')).map((x) => [x.tid, x]))
  : {};

const fallos = [];
for (let i = 0; i < objetivo.length; i++) {
  const { url, tag } = objetivo[i];
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const status = resp ? resp.status() : 0;
    if (status >= 400) {
      fallos.push({ tag, url, status });
      console.log(`[${i + 1}/${objetivo.length}] ${tag.padEnd(13)} HTTP ${status}  <-- LISTADO NO DISPONIBLE`);
      await sleep(4000);
      continue;
    }
    // El listado carga en diferido y se queda en ~27 tarjetas por mucho que se
    // baje: para ver mas hay que pulsar "Show more" (no hay paginacion por URL).
    for (let s = 0; s < 6; s++) { await page.mouse.wheel(0, 2000); await sleep(700); }
    for (let clic = 0; clic < MAS_CLICS; clic++) {
      const btn = page.locator('button, a').filter({ hasText: /^\s*Show more\s*$/i }).first();
      if (!(await btn.count())) break;
      const antes = await page.locator('[data-test-id="verticalActivityCard"]').count();
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await btn.click({ timeout: 8000 }).catch(() => {});
      await sleep(2600);
      for (let s = 0; s < 3; s++) { await page.mouse.wheel(0, 1800); await sleep(600); }
      const despues = await page.locator('[data-test-id="verticalActivityCard"]').count();
      if (despues <= antes) break;   // ya no crece: no insistir
    }
    await sleep(1200);

    const items = await page.evaluate(() => {
      const BADGES = ['Bestseller', 'Likely to sell out', 'Top pick', 'Originals by GetYourGuide',
        'Original by GetYourGuide', 'New activity', 'Official ticket'];
      const cards = [...document.querySelectorAll('[data-test-id="verticalActivityCard"]')];
      const out = [];
      cards.forEach((card, idx) => {
        const a = card.querySelector('a[href*="-t"]') || card.closest('a[href*="-t"]');
        if (!a) return;
        const m = (a.getAttribute('href') || '').match(/\/([a-z0-9-]+-l\d+)\/([a-z0-9-]+-t(\d+))/i);
        if (!m) return;
        const txt = (card.innerText || '').replace(/ /g, ' ');
        // "4.6\n(116,278)" -> valoracion y nº de reseñas
        const rr = txt.match(/(\d(?:[.,]\d)?)\s*\(([\d.,]+)\)/);
        const titulo = (card.querySelector('h3, h2, [class*="title"]')?.innerText || '')
          .replace(/\s+/g, ' ').trim();
        out.push({
          tid: m[3], loc: m[1], slug: m[2], path: `/${m[1]}/${m[2]}/`,
          posicion: idx + 1,
          titulo,
          valoracion: rr ? parseFloat(rr[1].replace(',', '.')) : null,
          resenas: rr ? parseInt(rr[2].replace(/[.,]/g, ''), 10) : null,
          distintivos: BADGES.filter((b) => txt.includes(b)),
          texto: txt.replace(/\s+/g, ' ').slice(0, 150),
        });
      });
      return out;
    });

    let nuevos = 0;
    for (const it of items) {
      const prev = all[it.tid];
      const aparicion = { listado: tag, posicion: it.posicion };
      if (!prev) {
        all[it.tid] = {
          tid: it.tid, loc: it.loc, slug: it.slug, path: it.path, tag,
          titulo: it.titulo, valoracion: it.valoracion, resenas: it.resenas,
          distintivos: it.distintivos, texto: it.texto,
          apariciones: [aparicion],
        };
        nuevos++;
      } else {
        // Ya lo teniamos: acumula la aparicion y quedate con el mejor dato.
        prev.apariciones = prev.apariciones || [];
        if (!prev.apariciones.some((x) => x.listado === tag)) prev.apariciones.push(aparicion);
        if (it.resenas && (!prev.resenas || it.resenas > prev.resenas)) prev.resenas = it.resenas;
        if (it.valoracion && !prev.valoracion) prev.valoracion = it.valoracion;
        if (it.titulo && !prev.titulo) prev.titulo = it.titulo;
        for (const d of it.distintivos) {
          prev.distintivos = prev.distintivos || [];
          if (!prev.distintivos.includes(d)) prev.distintivos.push(d);
        }
      }
    }
    const conResenas = items.filter((x) => x.resenas).length;
    console.log(`[${i + 1}/${objetivo.length}] ${tag.padEnd(13)} HTTP ${status}  tarjetas=${String(items.length).padStart(3)}  con reseñas=${String(conResenas).padStart(3)}  nuevas=${nuevos}`);
  } catch (e) {
    fallos.push({ tag, url, error: String(e.message).slice(0, 90) });
    console.log(`[${i + 1}/${objetivo.length}] ${tag.padEnd(13)} ERROR ${String(e.message).slice(0, 70)}`);
  }
  writeFileSync(OUT, JSON.stringify(Object.values(all), null, 1), 'utf8');
  if (i < objetivo.length - 1) await sleep(5000 + Math.random() * 4000);
}
await ctx.close();

const arr = Object.values(all);
console.log(`\nCosechadas ${arr.length} actividades unicas -> ${path.relative(ROOT, OUT)}`);
console.log(`  con nº de reseñas: ${arr.filter((x) => x.resenas).length}`);
console.log(`  con distintivo GYG: ${arr.filter((x) => (x.distintivos || []).length).length}`);
if (fallos.length) {
  console.log('\nLISTADOS QUE NO SE PUDIERON COSECHAR (no se rellenan a ojo):');
  fallos.forEach((f) => console.log('  -', f.tag, f.url, f.status || f.error));
}
