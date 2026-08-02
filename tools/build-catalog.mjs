// Generate web/catalog.js (window.NTL_CATALOG) from web/catalog.csv.
// Run this after editing catalog.csv (adding a row = adding an activity).
//   node build-catalog.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsv } from './lib/csv.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSV = path.join(ROOT, 'web', 'catalog.csv');
const OUT = path.join(ROOT, 'web', 'catalog.js');

const PROVINCES = ['barcelona', 'tarragona', 'girona', 'lleida'];
const CATEGORIES = ['culture', 'sea', 'tours', 'food'];
// Distintivo de la tarjeta. Vacio = sin distintivo (la mayoria).
// Un valor desconocido no se pinta, asi que se avisa en vez de callarlo.
const DISTINTIVOS = ['travelers-choice', 'top-pick'];

const { records } = parseCsv(readFileSync(CSV, 'utf8'));

const FRANJAS = ['dia', 'tarde', 'noche', 'flexible'];
const num = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };

/** "9:30" -> 570 minutos, o null si no es una hora valida. */
const hhmm = (v) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v).trim());
  if (!m) return null;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
};
const pad = (v) => {
  const [h, m] = String(v).trim().split(':');
  return String(parseInt(h, 10)).padStart(2, '0') + ':' + m;
};

const warn = [];
// Errores que paran la generacion. Solo hay una clase: quedarse sin horario.
// Una actividad sin ventana no se puede recomendar por hora, y colarla en el
// catalogo significa volver a proponer la Sagrada Familia a las 23:33.
const grave = [];

const catalog = records.map((r, i) => {
  const provincia = (r.provincia || '').trim().toLowerCase();
  const categoria = (r.categoria || '').trim().toLowerCase();
  if (!PROVINCES.includes(provincia)) warn.push(`row ${i + 1} "${r.titulo}": unknown provincia "${provincia}"`);
  if (!CATEGORIES.includes(categoria)) warn.push(`row ${i + 1} "${r.titulo}": unknown categoria "${categoria}"`);
  if (!r.url_getyourguide) warn.push(`row ${i + 1} "${r.titulo}": missing url_getyourguide`);
  if (!/partner_id=IBO5PAK/.test(r.url_getyourguide || '')) warn.push(`row ${i + 1} "${r.titulo}": url missing partner_id=IBO5PAK`);
  if (!r.imagen) warn.push(`row ${i + 1} "${r.titulo}": missing imagen (run scrape-gyg or paste URL)`);
  // `zonas`: a que otras ciudades sirve esta actividad, ademas de la suya.
  // Vacio = solo sirve a su propia ciudad. El `city` NO se repite dentro.
  const zonas = (r.zonas || '').split('|').map((z) => z.trim().toLowerCase()).filter(Boolean);
  for (const z of zonas) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(z)) {
      warn.push(`row ${i + 1} "${r.titulo}": zona con formato raro "${z}" (esperado: minusculas, sin acentos, con guiones)`);
    }
  }
  const ciudadPropia = (r.city || '').trim().toLowerCase();
  if (zonas.includes(ciudadPropia)) {
    warn.push(`row ${i + 1} "${r.titulo}": la zona "${ciudadPropia}" es su propia ciudad y sobra en zonas`);
  }
  const distintivo = (r.distintivo || '').trim().toLowerCase();
  if (distintivo && !DISTINTIVOS.includes(distintivo)) {
    warn.push(`row ${i + 1} "${r.titulo}": unknown distintivo "${distintivo}" (valid: ${DISTINTIVOS.join(', ')} or empty)`);
  }
  // Ventana en la que la actividad puede EMPEZAR ("09:00-18:00"). Si la hora de
  // cierre es menor que la de apertura, cruza medianoche (discotecas). Sin esto
  // el recomendador propone la Sagrada Familia a las 23:33.
  const horario = String(r.horario || '').trim();
  let abre = '', cierra = '';
  if (horario) {
    const m = horario.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (m && hhmm(m[1]) !== null && hhmm(m[2]) !== null) {
      abre = pad(m[1]);
      cierra = pad(m[2]);
    } else {
      grave.push(`row ${i + 1} "${r.titulo}": horario mal formado "${horario}" (se espera HH:MM-HH:MM)`);
    }
  } else {
    grave.push(`row ${i + 1} "${r.titulo}": SIN HORARIO`);
  }
  const franja = String(r.franja || '').trim().toLowerCase();
  if (franja && !FRANJAS.includes(franja)) {
    warn.push(`row ${i + 1} "${r.titulo}": franja desconocida "${franja}" (validas: ${FRANJAS.join(', ')})`);
  }

  return {
    order: r.order ? parseInt(r.order, 10) : i + 1,
    provincia,
    city: (r.city || provincia).trim().toLowerCase(),
    categoria,
    categoriaLabel: r.categoria_label || '',
    abre,
    cierra,
    franja: FRANJAS.includes(franja) ? franja : '',
    titulo: r.titulo || '',
    descripcion: r.descripcion || '',
    precio: num(r.precio),
    precioDisplay: r.precio_display || '',
    rating: num(r.rating),
    distintivo: DISTINTIVOS.includes(distintivo) ? distintivo : '',
    zonas,
    keywords: (r.keywords || r.titulo || '').toLowerCase(),
    etiquetaPie: r.etiqueta_pie || '',
    url: r.url_getyourguide || '',
    imagen: r.imagen || '',
  };
}).sort((a, b) => a.order - b.order);

// REGLA: toda actividad nueva se clasifica en su horario antes de entrar. Si
// falta uno, no se genera nada: es preferible un catalogo sin actualizar a uno
// que recomiende sitios cerrados.
if (grave.length) {
  console.error(`\nNo se ha generado nada. ${grave.length} actividad(es) sin horario valido:`);
  grave.slice(0, 40).forEach((g) => console.error('  -', g));
  if (grave.length > 40) console.error(`  ... y ${grave.length - 40} mas`);
  console.error('\nAñade la columna "horario" (HH:MM-HH:MM, hora de INICIO) y "franja"');
  console.error('(dia|tarde|noche|flexible) a esas filas de catalog.csv y vuelve a ejecutar.');
  process.exit(1);
}

const banner = '/* AUTO-GENERATED from catalog.csv by tools/build-catalog.mjs — DO NOT EDIT BY HAND.\n' +
  `   ${catalog.length} activities. Regenerate with: node tools/build-catalog.mjs */\n`;
writeFileSync(OUT, banner + 'window.NTL_CATALOG = ' + JSON.stringify(catalog, null, 2) + ';\n', 'utf8');

console.log(`Wrote ${catalog.length} activities -> ${path.relative(ROOT, OUT)}`);
const by = (k) => catalog.reduce((a, x) => ((a[x[k]] = (a[x[k]] || 0) + 1), a), {});
console.log('by province:', by('provincia'));
console.log('by category:', by('categoria'));
console.log('with image:', catalog.filter((x) => x.imagen).length, '/', catalog.length);
console.log('by distintivo:', catalog.reduce((a, x) => ((a[x.distintivo || '(ninguno)'] = (a[x.distintivo || '(ninguno)'] || 0) + 1), a), {}));
if (warn.length) { console.log(`\n${warn.length} warning(s):`); warn.slice(0, 40).forEach((w) => console.log('  -', w)); }
