// Prepara tools/new-activities.json con las del top 50 que NO estan todavia en
// catalog.csv, infiriendo provincia, ciudad, categoria y etiqueta de pie a partir
// de la localidad y del slug de GYG. El titulo, la descripcion, el precio, la
// valoracion y la imagen NO se inventan: los saca add-activities.mjs de la ficha.
//
//   node curate-top50.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TOP = path.join(ROOT, 'tools', 'top50.json');
const OUT = path.join(ROOT, 'tools', 'new-activities.json');

const CAT_LABEL = { culture: 'Culture', sea: 'Sea & Adventure', tours: 'Tour', food: 'Food & Nightlife' };

function categoria(slug) {
  const s = slug.toLowerCase();
  if (/pub-crawl|nightlife|club|boat-party|party|flamenco|tapas|wine|winery|food|paella|cooking|gastro|market|vermouth|dinner|brunch|concert|show|cava/.test(s)) return 'food';
  if (/boat|catamaran|kayak|snorkel|jet-ski|jetski|ferry|cruise|sailing|sail|dive|diving|paddle|speedboat|water-park|aquatic|parasail|quad|rafting|canyon|zip|via-ferrata|paraglid|horse|buggy|bike|climb|adventure|trek|off-road|segway|kart|hiking|hike|4x4|surf/.test(s)) return 'sea';
  if (/museum|cathedral|castle|dali|history|historic|walking|jewish|monaster|gothic|art|old-town|monument|palace|basilica|romanesque|heritage|game-of-thrones|sagrada|guell|batllo|pedrera|aquarium|zoo|camp-nou|barca|picasso|miro|entry-ticket|admission|ticket/.test(s)) return 'culture';
  return 'tours';
}

function etiquetaPie(slug, cat) {
  const s = slug.toLowerCase();
  if (/pub-crawl|nightlife|club|party/.test(s)) return 'Nightlife';
  if (/boat|catamaran|cruise|sailing|ferry/.test(s)) return 'Boat Trip';
  if (/kayak|snorkel|paddle|jet-ski|jetski|dive|surf/.test(s)) return 'Water Sports';
  if (/quad|rafting|canyon|zip|buggy|off-road|4x4/.test(s)) return 'Adventure';
  if (/hiking|hike|trek/.test(s)) return 'Hiking';
  if (/skip-the-line|fast-track/.test(s)) return 'Skip the Line';
  if (/guided-tour|guided|tour-with/.test(s)) return 'Guided Tour';
  if (/wine|winery|vineyard|tapas|food|paella|cooking/.test(s)) return 'Wine & Food';
  if (/flamenco|show|concert/.test(s)) return 'Live Show';
  if (/entry-ticket|admission|ticket/.test(s)) return 'Entry Ticket';
  if (/hop-on|bus/.test(s)) return 'Hop-On Hop-Off';
  return cat === 'culture' ? 'Must See' : 'Guided Tour';
}

// Localidad de GYG -> ciudad que enseñamos y que usan los deep-links ?zona=
function ciudad(loc) {
  const base = String(loc).replace(/-l\d+$/, '').replace(/-spain$/, '');
  const MAP = {
    'barcelona': 'barcelona', 'gothic-quarter-barcelona': 'barcelona',
    'montserrat': 'montserrat', 'sitges': 'sitges', 'el-penedes': 'penedes',
    'salou': 'salou', 'cambrils': 'cambrils', 'tarragona': 'tarragona',
    'portaventura-park': 'salou', 'reus': 'reus',
    'girona': 'girona', 'lloret-de-mar': 'lloret-de-mar', 'tossa-de-mar': 'tossa-de-mar',
    'costa-brava': 'costa-brava', 'figueres': 'figueres', 'roses': 'roses',
    'palamos': 'palamos', 'l-estartit': 'l-estartit', 'blanes': 'blanes',
    'lleida': 'lleida', 'vielha': 'vielha', 'val-d-aran': 'val-d-aran',
  };
  return MAP[base] || base;
}

const { top } = JSON.parse(readFileSync(TOP, 'utf8'));
const faltan = top.filter((x) => !x.yaEnCatalogo);

const curadas = faltan.map((x) => {
  const cat = categoria(x.url);
  return {
    path: new URL(x.url).pathname,
    tid: x.tid,
    provincia: x.provincia,
    city: ciudad(x.loc),
    categoria: cat,
    categoria_label: CAT_LABEL[cat],
    etiqueta_pie: etiquetaPie(x.url, cat),
    // Del top 50 -> su distintivo ya se sabe. apply-distintivos lo reafirma luego.
    distintivo: 'travelers-choice',
    _rank: x.rank,
    _resenas: x.resenas,
    _titulo_gyg: x.titulo,
  };
});

writeFileSync(OUT, JSON.stringify(curadas, null, 1), 'utf8');
console.log(`${curadas.length} actividades del top 50 por añadir -> ${path.relative(ROOT, OUT)}`);
const by = (k) => curadas.reduce((a, x) => ((a[x[k]] = (a[x[k]] || 0) + 1), a), {});
console.log('  por provincia:', by('provincia'));
console.log('  por categoria:', by('categoria'));
console.log('\n  listado:');
curadas.forEach((c) => console.log(
  `   #${String(c._rank).padStart(2)} ${String(c._resenas).padStart(6)} res  ${c.provincia.padEnd(9)} ${c.categoria.padEnd(7)} ${c.city.padEnd(14)} ${(c._titulo_gyg || '').slice(0, 44)}`));
