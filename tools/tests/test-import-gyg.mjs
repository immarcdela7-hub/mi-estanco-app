/* Lectura del export de ventas de GetYourGuide (crm-web/src/lib/gygCsv.ts).

   No abre navegador ni base de datos: el modulo es puro a proposito, porque
   aqui un fallo no se ve. Una comision mal leida se paga al establecimiento y
   ya no vuelve, y una fila de totales importada como venta cuadra con la suma,
   asi que nadie la busca.

   Los casos salen del export real del panel de GetYourGuide del 29/07/2026.

   node tests/test-import-gyg.mjs
*/
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const fuente = join(raiz, 'crm-web', 'src', 'lib', 'gygCsv.ts');
const salida = mkdtempSync(join(tmpdir(), 'ntl-gygcsv-'));

const tsc = join(raiz, 'crm-web', 'node_modules', 'typescript', 'bin', 'tsc');
execFileSync(
  process.execPath,
  [tsc, fuente, '--outDir', salida, '--module', 'esnext', '--target', 'es2022',
    '--moduleResolution', 'bundler', '--skipLibCheck'],
  { cwd: join(raiz, 'crm-web'), stdio: 'pipe' }
);
const G = await import(pathToFileURL(join(salida, 'gygCsv.js')).href);

const results = [];
function log(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -- ' + detail : ''}`);
}

/* Un CSV minimo a mano: el modulo recibe filas ya parseadas por Papa, con las
   cabeceras en minusculas, asi que aqui se simula eso mismo. */
const fila = (o) => ({
  '': '', status: '', activity: '', city: '', 'booking date': '', 'travel date': '',
  campaign: '', 'traveler origin': '', 'view activity': '', 'booking reference': '',
  participants: '', 'potential income': '', ...o,
});

// La venta de verdad: Prado, 29/07/2026, 2 personas, 2,88 EUR, SIN campaña.
const PRADO = fila({
  '': '1', status: 'Completed', activity: 'Madrid: Prado Museum Entry Ticket', city: 'Madrid',
  'booking date': '2026-07-29', 'travel date': '2026-07-31', campaign: '',
  'traveler origin': 'Spain', 'booking reference': 'GYGLMRV8XFKQ',
  participants: '2', 'potential income': '2.88',
});
// La ultima fila de su export: totales, sin referencia ni actividad ni estado.
const TOTALES = fila({ participants: '2', 'potential income': '2.88' });

const CAB_GYG = Object.keys(PRADO);
const CAB_NTL = ['fecha', 'codigo_establecimiento', 'referencia_reserva', 'actividad',
  'entradas', 'importe_total', 'comision_gyg'];

// ---------- 1. Detectar el formato sin preguntar ----------
log('Reconoce el export de GetYourGuide', G.detectarFormato(CAB_GYG) === 'gyg',
  String(G.detectarFormato(CAB_GYG)));
log('Reconoce nuestra plantilla', G.detectarFormato(CAB_NTL) === 'ntl',
  String(G.detectarFormato(CAB_NTL)));
log('Y no se inventa un formato con cabeceras ajenas',
  G.detectarFormato(['nombre', 'importe', 'fecha']) === null,
  String(G.detectarFormato(['nombre', 'importe', 'fecha'])));
// Sus cabeceras vienen con mayusculas; el CRM las baja antes, pero si algun dia
// deja de hacerlo la deteccion no debe caerse.
log('Da igual como vengan de mayusculas',
  G.detectarFormato(['Status', 'Activity', 'Booking date', 'Campaign', 'Booking Reference']) === 'gyg');

// ---------- 2. La venta real se lee entera ----------
{
  const r = G.normalizar([PRADO, TOTALES], 'gyg');
  const v = r.filas[0];
  log('La fila de totales no se importa como venta', r.filas.length === 1,
    `${r.filas.length} fila(s)`);
  log('Lee la fecha de COMPRA, no la de la visita', v.fecha === '2026-07-29',
    `${v.fecha} (visita 2026-07-31)`);
  log('Lee el localizador', v.referencia === 'GYGLMRV8XFKQ', v.referencia);
  log('Lee los participantes', v.entradas === 2, String(v.entradas));
  log('Lee lo que ingresamos', v.comision === 2.88, String(v.comision));
  log('Y deja en 0 lo que su export no trae', v.importeTotal === 0, String(v.importeTotal));
  log('Detecta que esta venta NO trae campaña', v.codigo === '', `«${v.codigo}»`);
}

// ---------- 3. Una cancelada no es una venta ----------
{
  const anulada = fila({
    status: 'Cancelled', activity: 'Barcelona: Sagrada Familia', 'booking date': '2026-07-20',
    'booking reference': 'GYGCANCEL1', participants: '2', 'potential income': '9.10',
  });
  const r = G.normalizar([PRADO, anulada], 'gyg');
  log('Una reserva cancelada no entra', r.filas.length === 1 && r.anuladas === 1,
    `${r.filas.length} importables, ${r.anuladas} anuladas`);

  // Un estado que no conocemos NO puede hacer desaparecer dinero en silencio.
  const raro = fila({
    status: 'Awaiting supplier', activity: 'X', 'booking date': '2026-07-21',
    'booking reference': 'GYGRARO1', participants: '1', 'potential income': '4.00',
  });
  const r2 = G.normalizar([raro], 'gyg');
  log('Un estado desconocido entra igual, no se pierde',
    r2.filas.length === 1 && r2.filas[0].estado === 'Awaiting supplier',
    `${r2.filas.length} fila(s)`);
}

// ---------- 4. Con campaña, que es el caso que da dinero al bar ----------
{
  const conCmp = fila({
    status: 'Completed', activity: 'Barcelona: Park Güell', 'booking date': '2026-08-01',
    campaign: 'EST-00012', 'booking reference': 'GYGWITHCMP', participants: '3',
    'potential income': '6.40',
  });
  const r = G.normalizar([conCmp], 'gyg');
  log('Con campaña, el codigo del establecimiento llega intacto',
    r.filas[0].codigo === 'EST-00012', r.filas[0].codigo);
}

// ---------- 5. Numeros y fechas como los escribe cada sitio ----------
log('Coma decimal europea', G.aNumero('2,88') === 2.88, String(G.aNumero('2,88')));
log('Punto decimal', G.aNumero('2.88') === 2.88, String(G.aNumero('2.88')));
log('Miles y decimales juntos', G.aNumero('1.234,50') === 1234.5, String(G.aNumero('1.234,50')));
log('Con simbolo de moneda', G.aNumero('2,88 €') === 2.88, String(G.aNumero('2,88 €')));
// Su propio export escribe "'-" en las celdas vacias de los resumenes.
log('El guion de sus resumenes vale cero', G.aNumero("'-") === 0, String(G.aNumero("'-")));
log('Fecha ISO', G.aFechaIso('2026-07-29') === '2026-07-29', String(G.aFechaIso('2026-07-29')));
log('Fecha europea', G.aFechaIso('29/07/2026') === '2026-07-29', String(G.aFechaIso('29/07/2026')));
log('Fecha con dia de un digito', G.aFechaIso('1/7/2026') === '2026-07-01', String(G.aFechaIso('1/7/2026')));
log('Una fecha que no lo es se rechaza', G.aFechaIso('el martes') === null,
  String(G.aFechaIso('el martes')));

// ---------- 6. Nuestra plantilla sigue funcionando ----------
{
  const nuestra = {
    fecha: '15/07/2026', codigo_establecimiento: 'EST-00012', referencia_reserva: 'GYG-ABC123',
    actividad: 'Sagrada Família', entradas: '2', importe_total: '52,00', comision_gyg: '6,24',
  };
  const r = G.normalizar([nuestra], 'ntl');
  const v = r.filas[0];
  log('La plantilla propia se lee igual que antes',
    v.fecha === '2026-07-15' && v.codigo === 'EST-00012' && v.importeTotal === 52 &&
    v.comision === 6.24 && v.entradas === 2, JSON.stringify(v));

  const mala = { ...nuestra, fecha: 'ayer' };
  const r2 = G.normalizar([mala], 'ntl');
  log('Y una fecha ilegible se rechaza diciendo en que linea',
    r2.filas.length === 0 && /Línea 2/.test(r2.descartes[0] || ''), r2.descartes[0]);
}

// ---------- 7. El caso que mas duele: una fila sin entradas ----------
{
  const sinPax = fila({
    status: 'Completed', activity: 'X', 'booking date': '2026-07-29',
    'booking reference': 'GYGNOPAX', participants: '', 'potential income': '3.00',
  });
  const r = G.normalizar([sinPax], 'gyg');
  log('Sin participantes cuenta una entrada, no cero', r.filas[0].entradas === 1,
    String(r.filas[0].entradas));
}

rmSync(salida, { recursive: true, force: true });

const fallos = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - fallos.length}/${results.length} pruebas OK ===`);
if (fallos.length) {
  console.log('FALLOS:');
  fallos.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail));
  process.exitCode = 1;
}
