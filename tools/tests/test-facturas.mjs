/* Archivo de facturas: guardado de ficheros y enlazado automatico.

   Dos cosas que no se ven mirando la pantalla:

   1. La puerta por donde entra un fichero que manda un desconocido
      (crm-web/src/lib/facturas.ts): que no se cuele algo que no es un PDF, que
      un nombre no acabe siendo una ruta, que no parta una cabecera HTTP.

   2. El enlazado por nombre (crm-web/src/lib/enlace.ts): de aqui salen la
      fecha y el IMPORTE de cada factura, asi que enlazar mal es peor que no
      enlazar. Un fallo aqui no da error: da una factura con el dinero de otra.

   node tests/test-facturas.mjs
*/
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const salida = mkdtempSync(join(tmpdir(), 'ntl-fac-'));
const almacen = mkdtempSync(join(tmpdir(), 'ntl-store-'));
process.env.FACTURAS_DIR = almacen;

const tsc = join(raiz, 'crm-web', 'node_modules', 'typescript', 'bin', 'tsc');
execFileSync(
  process.execPath,
  [tsc,
    join(raiz, 'crm-web', 'src', 'lib', 'facturas.ts'),
    join(raiz, 'crm-web', 'src', 'lib', 'enlace.ts'),
    '--outDir', salida, '--module', 'esnext', '--target', 'es2022',
    '--moduleResolution', 'bundler', '--skipLibCheck'],
  { cwd: join(raiz, 'crm-web'), stdio: 'pipe' }
);
// `server-only` no existe fuera de Next: se quita del compilado.
const compilado = join(salida, 'facturas.js');
writeFileSync(compilado, readFileSync(compilado, 'utf8').replace(/^import ["']server-only["'];?$/m, ''));
const F = await import(pathToFileURL(compilado).href);
const E = await import(pathToFileURL(join(salida, 'enlace.js')).href);

const results = [];
function log(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -- ' + detail : ''}`);
}

const bytes = (...b) => new Uint8Array(b);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);

// ---------- 1. Que es el fichero DE VERDAD ----------
log('Reconoce un PDF', F.tipoReal(PDF) === 'application/pdf', String(F.tipoReal(PDF)));
log('Reconoce un PNG', F.tipoReal(PNG) === 'image/png', String(F.tipoReal(PNG)));
log('Reconoce un JPG', F.tipoReal(JPG) === 'image/jpeg', String(F.tipoReal(JPG)));

// Un HTML disfrazado de PDF: si se colara y luego se sirviera de vuelta, seria
// un XSS con la sesion del administrador delante.
const HTML = new TextEncoder().encode('<html><script>alert(1)</script>');
log('Un HTML disfrazado de PDF no pasa', F.tipoReal(HTML) === null, String(F.tipoReal(HTML)));
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
log('Un SVG tampoco (es ejecutable en el navegador)', F.tipoReal(SVG) === null, String(F.tipoReal(SVG)));
log('Un fichero vacio no es nada', F.tipoReal(bytes()) === null, String(F.tipoReal(bytes())));

// ---------- 2. El nombre no puede ser una ruta ni partir una cabecera ----------
log('Un nombre con ../ se queda sin ruta',
  !F.nombreLimpio('../../etc/passwd').includes('/'), F.nombreLimpio('../../etc/passwd'));
log('Y con barras invertidas tampoco',
  !/[\\/]/.test(F.nombreLimpio('..\\..\\windows\\system32')), F.nombreLimpio('..\\..\\windows\\system32'));
const inyectado = F.nombreLimpio('factura.pdf\r\nSet-Cookie: robada=1');
log('Un salto de linea no llega a la cabecera', !/[\r\n]/.test(inyectado), JSON.stringify(inyectado));
log('Y las comillas no cierran el filename', !inyectado.includes('"'), JSON.stringify(inyectado));
log('Un nombre normal se respeta',
  F.nombreLimpio('Factura GYG julio 2026.pdf') === 'Factura GYG julio 2026.pdf',
  F.nombreLimpio('Factura GYG julio 2026.pdf'));
log('Un nombre vacio no deja el fichero sin nombre',
  F.nombreLimpio('') === 'factura', F.nombreLimpio(''));

// ---------- 3. Guardar de verdad, en disco ----------
const comoFile = (data, name) => ({
  size: data.length,
  name,
  arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
});

{
  const g = await F.guardarFichero(comoFile(PDF, 'Factura GYG.pdf'));
  log('Guarda el PDF y devuelve su huella',
    g.fileMime === 'application/pdf' && /^[a-f0-9]{64}$/.test(g.sha256), g.sha256.slice(0, 16) + '…');
  log('El nombre en disco no viene del original',
    !g.storedName.includes('Factura') && /^[a-z0-9]+-[a-f0-9]{16}\.pdf$/.test(g.storedName), g.storedName);
  log('Y el fichero esta realmente en la carpeta', readdirSync(almacen).includes(g.storedName));

  const leido = await F.leerFichero(g.storedName);
  log('Se puede volver a leer igual', Buffer.from(PDF).equals(leido), `${leido.length} bytes`);

  const g2 = await F.guardarFichero(comoFile(PDF, 'Factura GYG.pdf'));
  log('Dos subidas del mismo nombre no se pisan', g.storedName !== g2.storedName);
  // Misma huella: es lo que permite detectar el duplicado al archivar.
  log('Y el mismo contenido da la misma huella', g.sha256 === g2.sha256, g2.sha256.slice(0, 16) + '…');

  await F.borrarFichero(g2.storedName);
  log('Borrar quita el fichero del disco', !readdirSync(almacen).includes(g2.storedName));
}

// ---------- 4. Lo que NO se guarda ----------
{
  let error = '';
  try { await F.guardarFichero(comoFile(HTML, 'malo.pdf')); } catch (e) { error = e.message; }
  log('Un HTML con nombre .pdf se rechaza', /PDF, JPG o PNG/.test(error), error);

  error = '';
  try { await F.guardarFichero(comoFile(bytes(), 'vacio.pdf')); } catch (e) { error = e.message; }
  log('Un fichero vacio se rechaza', /vac/i.test(error), error);

  error = '';
  try { await F.guardarFichero({ ...comoFile(PDF, 'gordo.pdf'), size: F.MAX_BYTES + 1 }); }
  catch (e) { error = e.message; }
  log('Uno que pasa del tope se rechaza antes de leerlo', /MB/.test(error), error);
}

// ---------- 5. Leer no puede salirse de la carpeta ----------
{
  let error = '';
  try { await F.leerFichero('../../../etc/passwd'); } catch (e) { error = e.message; }
  log('Leer con ../ no sale de la carpeta', /no válido/.test(error), error);

  error = '';
  try { await F.leerFichero('cualquiera.pdf'); } catch (e) { error = e.message; }
  log('Y un nombre que no siga nuestro patron tampoco', /no válido/.test(error), error);
}

// ---------- 6. Enlazado por nombre: de aqui sale el DINERO ----------
const VENTAS = [
  { id: 10, bookingRef: 'GYG-A1B2C3' },
  { id: 11, bookingRef: 'GYG-D4E5F6' },
  { id: 12, bookingRef: 'X7Y8Z9Q' },
];

log('Normaliza el prefijo y los guiones',
  E.normalizarRef('gyg-a1b2c3') === 'A1B2C3', E.normalizarRef('gyg-a1b2c3'));
log('Y da igual como lo escriba GYG',
  E.normalizarRef('GYG A1B2C3') === E.normalizarRef('A1B2C3'), E.normalizarRef('GYG A1B2C3'));

log('Enlaza el PDF con su venta',
  E.enlazarPorNombre('invoice_GYG-A1B2C3.pdf', VENTAS) === 10,
  String(E.enlazarPorNombre('invoice_GYG-A1B2C3.pdf', VENTAS)));
log('Aunque el nombre lo escriba de otra forma',
  E.enlazarPorNombre('factura gyg a1b2c3 julio.pdf', VENTAS) === 10,
  String(E.enlazarPorNombre('factura gyg a1b2c3 julio.pdf', VENTAS)));
log('Y encuentra la otra venta, no siempre la primera',
  E.enlazarPorNombre('D4E5F6.pdf', VENTAS) === 11,
  String(E.enlazarPorNombre('D4E5F6.pdf', VENTAS)));

// Lo que de verdad importa: NO enlazar mal. Una factura con el importe de otra
// venta no da ningun error, solo dinero equivocado en el archivo.
log('Un nombre sin localizador no se enlaza',
  E.enlazarPorNombre('factura julio 2026.pdf', VENTAS) === null,
  String(E.enlazarPorNombre('factura julio 2026.pdf', VENTAS)));
log('Un localizador que no conocemos no se enlaza',
  E.enlazarPorNombre('GYG-ZZZZZZ.pdf', VENTAS) === null,
  String(E.enlazarPorNombre('GYG-ZZZZZZ.pdf', VENTAS)));
log('Un nombre vacio no se enlaza',
  E.enlazarPorNombre('', VENTAS) === null, String(E.enlazarPorNombre('', VENTAS)));

// Localizadores cortos: podrian aparecer por casualidad dentro de una fecha o
// de un numero de pedido y enlazar la factura a la venta equivocada.
log('Un localizador corto no engancha por casualidad',
  E.enlazarPorNombre('20260731.pdf', [{ id: 1, bookingRef: '2026' }]) === null,
  String(E.enlazarPorNombre('20260731.pdf', [{ id: 1, bookingRef: '2026' }])));

// Si el nombre contiene dos localizadores conocidos, no hay forma de saber cual
// es: se deja a mano en vez de elegir uno al azar.
log('Si el nombre vale para dos ventas, no elige ninguna',
  E.enlazarPorNombre('A1B2C3-y-D4E5F6.pdf', VENTAS) === null,
  String(E.enlazarPorNombre('A1B2C3-y-D4E5F6.pdf', VENTAS)));

rmSync(salida, { recursive: true, force: true });
rmSync(almacen, { recursive: true, force: true });

const fallos = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - fallos.length}/${results.length} pruebas OK ===`);
if (fallos.length) {
  console.log('FALLOS:');
  fallos.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail));
  process.exitCode = 1;
}
