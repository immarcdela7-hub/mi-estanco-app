// Decide el TOP 50 de Cataluña a partir de tools/harvest.json y deja la prueba
// escrita en tools/top50.json.
//
// GYG no publica ventas, asi que se combinan las tres señales que si publica:
//   1. nº de reseñas  -> el mejor proxy de volumen que existe. Se usa en
//      logaritmo porque va de decenas a cientos de miles: en lineal, una sola
//      actividad aplastaria a todas las demas.
//   2. posicion en el listado -> el orden por defecto de GYG es por popularidad.
//      Se premia estar arriba, con la MEJOR posicion entre todos los listados.
//   3. distintivos de GYG -> Bestseller, Likely to sell out, Top pick.
//
//   node rank-top50.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsv } from './lib/csv.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const HARVEST = path.join(ROOT, 'tools', 'harvest.json');
const CSV = path.join(ROOT, 'web', 'catalog.csv');
const OUT = path.join(ROOT, 'tools', 'top50.json');
const CUANTAS = 50;

// Localidad de GYG -> provincia. Solo Cataluña: los listados de GYG venden
// tambien actividades de otros destinos y esas no pintan nada aqui.
const PROV = {
  barcelona: ['barcelona', 'sitges', 'montserrat', 'castelldefels', 'santa-susanna-spain',
    'palafolls', 'badalona', 'gothic-quarter-barcelona', 'el-penedes', 'mataro', 'terrassa',
    'sant-cugat-del-valles', 'vilanova-i-la-geltru', 'manresa', 'cardona', 'sabadell'],
  tarragona: ['tarragona', 'salou', 'cambrils', 'reus', 'montblanc', 'portaventura-park',
    'costa-daurada', 'costa-dorada', 'la-pineda', 'miami-platja', 'l-ametlla-de-mar',
    'delta-de-l-ebre', 'tortosa', 'priorat', 'siurana'],
  girona: ['girona', 'lloret-de-mar', 'tossa-de-mar', 'costa-brava', 'figueres', 'roses-spain',
    'palamos', 'l-estartit', 'sant-feliu-de-guixols', 'blanes', 'l-escala', 'empuriabrava',
    'calonge', 'platja-d-aro', 'llanca', 'peratallada', 'port-lligat', 'cadaques', 'besalu',
    'begur', 'pals', 'conjunt-de-castell-d-aro', 'olot', 'ripoll', 'camprodon', 'banyoles',
    'castello-d-empuries', 'santa-cristina-d-aro', 'salt', 'la-bisbal-d-emporda'],
  lleida: ['lleida', 'vielha', 'baqueira', 'val-d-aran', 'la-seu-d-urgell', 'seu-d-urgell',
    'sort', 'boi', 'espot', 'rialp', 'tremp', 'aiguestortes', 'la-vall-de-boi', 'llavorsi'],
};
const provinciaDe = (loc) => {
  const base = String(loc).replace(/-l\d+$/, '');
  for (const [p, lista] of Object.entries(PROV)) if (lista.includes(base)) return p;
  return null;
};

const harvest = JSON.parse(readFileSync(HARVEST, 'utf8'));
const { records } = parseCsv(readFileSync(CSV, 'utf8'));
const enCatalogo = new Map(records
  .map((r) => [(r.url_getyourguide.match(/-t(\d+)/) || [])[1], r])
  .filter(([t]) => t));

// --- puntuacion ---
const BONO = { 'Bestseller': 0.40, 'Likely to sell out': 0.25, 'Top pick': 0.25 };
function puntuar(x) {
  const resenas = x.resenas || 0;
  const base = Math.log10(resenas + 1);                     // 0 (sin reseñas) .. ~5 (100k)
  const mejorPos = Math.min(...(x.apariciones || [{ posicion: 999 }]).map((a) => a.posicion));
  const bonoPos = (1 - Math.min(mejorPos, 100) / 100) * 0.5; // hasta +0.5 por salir arriba
  const bonoDist = (x.distintivos || []).reduce((s, d) => s + (BONO[d] || 0), 0);
  return { total: base + bonoPos + bonoDist, base, mejorPos, bonoPos, bonoDist, resenas };
}

const sinProvincia = [];
const candidatas = harvest
  .map((x) => {
    const provincia = provinciaDe(x.loc);
    if (!provincia) { sinProvincia.push(x.loc); return null; }
    const p = puntuar(x);
    return { ...x, provincia, ...p, puntos: p.total };
  })
  .filter(Boolean)
  // Sin reseñas no hay prueba de volumen: no puede entrar en un "mas vendidas".
  .filter((x) => x.resenas > 0)
  .sort((a, b) => b.puntos - a.puntos);

const top = candidatas.slice(0, CUANTAS).map((x, i) => ({
  rank: i + 1,
  tid: x.tid,
  titulo: x.titulo,
  provincia: x.provincia,
  loc: x.loc,
  url: 'https://www.getyourguide.com' + x.path,
  resenas: x.resenas,
  valoracion: x.valoracion,
  mejorPosicion: x.mejorPos,
  distintivosGyg: x.distintivos || [],
  listados: (x.apariciones || []).map((a) => `${a.listado}#${a.posicion}`),
  puntos: Math.round(x.puntos * 1000) / 1000,
  yaEnCatalogo: enCatalogo.has(x.tid),
}));

writeFileSync(OUT, JSON.stringify({
  generado: 'node tools/rank-top50.mjs',
  criterio: {
    resenas: 'log10(reseñas+1). Proxy de volumen; GYG no publica ventas.',
    posicion: 'hasta +0.5 por la mejor posicion en los listados (su orden por defecto es por popularidad)',
    distintivos: BONO,
    excluidas: 'sin reseñas, o fuera de Cataluña',
  },
  candidatasValoradas: candidatas.length,
  top,
}, null, 1), 'utf8');

const ya = top.filter((x) => x.yaEnCatalogo).length;
console.log(`Candidatas de Cataluña con reseñas: ${candidatas.length}`);
console.log(`TOP ${CUANTAS} -> ${path.relative(ROOT, OUT)}`);
console.log(`  ya estaban en catalog.csv: ${ya}`);
console.log(`  faltan por añadir        : ${top.length - ya}`);
const porProv = top.reduce((a, x) => ((a[x.provincia] = (a[x.provincia] || 0) + 1), a), {});
console.log('  reparto por provincia    :', porProv);
console.log('\n  top 15:');
top.slice(0, 15).forEach((x) => console.log(
  `   ${String(x.rank).padStart(2)}. ${String(x.resenas).padStart(7)} reseñas  ${x.provincia.padEnd(9)} ${x.yaEnCatalogo ? 'YA' : '--'}  ${(x.titulo || '').slice(0, 46)}`));
if (sinProvincia.length) {
  const u = [...new Set(sinProvincia)];
  console.log(`\n  (${sinProvincia.length} resultados descartados por no ser de Cataluña, ${u.length} localidades distintas)`);
}
