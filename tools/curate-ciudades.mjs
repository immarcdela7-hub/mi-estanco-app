// Prepara tools/new-activities.json con lo que le falta a cada ciudad para tener
// diez PROPIAS, cogiendo de la cosecha lo que GetYourGuide tiene EN esa ciudad,
// ordenado por el criterio de popularidad de la fase 1.
//
// Solo se cogen actividades cuya localidad de GYG ES la ciudad: nada de traer
// una de Barcelona y decir que es de Tarragona.
//
//   node curate-ciudades.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsv } from './lib/csv.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSV = path.join(ROOT, 'web', 'catalog.csv');
const MUN = path.join(ROOT, 'tools', 'municipios.json');
const HARVEST = path.join(ROOT, 'tools', 'harvest.json');
const OUT = path.join(ROOT, 'tools', 'new-activities.json');
const OBJETIVO = 10;

const CAT_LABEL = { culture: 'Culture', sea: 'Sea & Adventure', tours: 'Tour', food: 'Food & Nightlife' };
const base = (loc) => String(loc).replace(/-l\d+$/, '').replace(/-spain$/, '');

function categoria(slug) {
  const s = slug.toLowerCase();
  if (/pub-crawl|nightlife|club|boat-party|party|flamenco|tapas|wine|winery|food|paella|cooking|gastro|market|vermouth|dinner|brunch|concert|show|cava|beer/.test(s)) return 'food';
  if (/boat|catamaran|kayak|snorkel|jet-ski|jetski|ferry|cruise|sailing|sail|dive|diving|paddle|speedboat|water-park|aquatic|parasail|quad|rafting|canyon|zip|via-ferrata|paraglid|horse|buggy|bike|climb|adventure|trek|off-road|segway|kart|hiking|hike|4x4|surf|balloon/.test(s)) return 'sea';
  if (/museum|cathedral|castle|dali|history|historic|walking|jewish|monaster|gothic|art|old-town|monument|palace|basilica|romanesque|heritage|roman|amphitheatre|entry-ticket|admission|ticket|guided-tour/.test(s)) return 'culture';
  return 'tours';
}
function etiquetaPie(slug, cat) {
  const s = slug.toLowerCase();
  if (/pub-crawl|nightlife|club|party/.test(s)) return 'Nightlife';
  if (/boat|catamaran|cruise|sailing|ferry/.test(s)) return 'Boat Trip';
  if (/kayak|snorkel|paddle|jet-ski|jetski|dive|surf/.test(s)) return 'Water Sports';
  if (/quad|rafting|canyon|zip|buggy|off-road|4x4|balloon/.test(s)) return 'Adventure';
  if (/hiking|hike|trek/.test(s)) return 'Hiking';
  if (/roman|amphitheatre|heritage|unesco/.test(s)) return 'Roman Heritage';
  if (/skip-the-line|fast-track/.test(s)) return 'Skip the Line';
  if (/wine|winery|vineyard|tapas|food|cooking/.test(s)) return 'Wine & Food';
  if (/flamenco|show|concert/.test(s)) return 'Live Show';
  if (/entry-ticket|admission|ticket/.test(s)) return 'Entry Ticket';
  if (/guided|tour-with|walking/.test(s)) return 'Guided Tour';
  return cat === 'culture' ? 'Must See' : 'Guided Tour';
}

const municipios = JSON.parse(readFileSync(MUN, 'utf8')).municipios;
const harvest = JSON.parse(readFileSync(HARVEST, 'utf8'));
const { records } = parseCsv(readFileSync(CSV, 'utf8'));
const yaEsta = new Set(records.map((r) => (r.url_getyourguide.match(/-t(\d+)/) || [])[1]).filter(Boolean));

const BONO = { 'Bestseller': 0.40, 'Likely to sell out': 0.25, 'Top pick': 0.25 };
const puntos = (h) => Math.log10((h.resenas || 0) + 1)
  + (1 - Math.min(Math.min(...(h.apariciones || [{ posicion: 999 }]).map((a) => a.posicion)), 100) / 100) * 0.5
  + (h.distintivos || []).reduce((s, d) => s + (BONO[d] || 0), 0);

const enCatalogoPorCiudad = records.reduce((a, r) => ((a[r.city] = (a[r.city] || 0) + 1), a), {});

const curadas = [];
const resumen = [];
for (const m of municipios) {
  const tiene = enCatalogoPorCiudad[m.slug] || 0;
  const faltan = OBJETIVO - tiene;
  if (faltan <= 0) continue;
  // Aqui NO se exige tener resenas, al reves que en el top 50: es la oferta
  // propia de la ciudad, y una actividad nueva sin resenas sigue siendo lo unico
  // que hay en Reus. Eso si, las que no tienen van al final.
  const suyas = harvest
    .filter((h) => base(h.loc) === m.slug && !yaEsta.has(h.tid))
    .sort((a, b) => puntos(b) - puntos(a))
    .slice(0, faltan);
  if (!suyas.length) continue;
  for (const h of suyas) {
    const cat = categoria(h.slug);
    curadas.push({
      path: h.path, tid: h.tid,
      provincia: m.provincia,
      city: m.slug,
      categoria: cat,
      categoria_label: CAT_LABEL[cat],
      etiqueta_pie: etiquetaPie(h.slug, cat),
      _ciudad: m.nombre, _resenas: h.resenas, _titulo_gyg: h.titulo,
    });
  }
  resumen.push({ ciudad: m.slug, tenia: tiene, anade: suyas.length, quedara: tiene + suyas.length });
}

writeFileSync(OUT, JSON.stringify(curadas, null, 1), 'utf8');
console.log(`${curadas.length} actividades por anadir -> ${path.relative(ROOT, OUT)}\n`);
console.log('ciudad                        tenia  anade  quedara');
resumen.forEach((r) => console.log(`  ${r.ciudad.padEnd(28)}${String(r.tenia).padStart(5)}${String(r.anade).padStart(7)}${String(r.quedara).padStart(9)}`));
console.log('\ndetalle:');
curadas.forEach((c) => console.log(`  ${c.city.padEnd(24)} ${String(c._resenas).padStart(6)} res  ${c.categoria.padEnd(7)} ${(c._titulo_gyg || '').slice(0, 46)}`));
