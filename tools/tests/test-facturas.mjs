/* Guardado de las facturas (crm-web/src/lib/facturas.ts).

   Sin navegador: lo que se prueba aqui es la puerta por donde entra un fichero
   que manda un desconocido. Los tres fallos que importan no se ven mirando la
   pantalla:

   - que se cuele algo que no es un PDF y luego se sirva de vuelta,
   - que un nombre de fichero acabe siendo una ruta y escriba donde no debe,
   - que el nombre viaje a una cabecera HTTP y la parta.

   node tests/test-facturas.mjs
*/
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const fuente = join(raiz, 'crm-web', 'src', 'lib', 'facturas.ts');
const salida = mkdtempSync(join(tmpdir(), 'ntl-fac-'));
const almacen = mkdtempSync(join(tmpdir(), 'ntl-store-'));
process.env.FACTURAS_DIR = almacen;

const tsc = join(raiz, 'crm-web', 'node_modules', 'typescript', 'bin', 'tsc');
execFileSync(
  process.execPath,
  [tsc, fuente, '--outDir', salida, '--module', 'esnext', '--target', 'es2022',
    '--moduleResolution', 'bundler', '--skipLibCheck'],
  { cwd: join(raiz, 'crm-web'), stdio: 'pipe' }
);
// `server-only` no existe fuera de Next: se sustituye por un modulo vacio.
const compilado = join(salida, 'facturas.js');
writeFileSync(compilado, readFileSync(compilado, 'utf8').replace(/^import ["']server-only["'];?$/m, ''));
const F = await import(pathToFileURL(compilado).href);

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

// Lo importante: un HTML disfrazado de PDF. Si se colara y luego se sirviera,
// seria un XSS con la sesion del administrador delante.
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
// Un salto de linea en el nombre inyectaria cabeceras en la respuesta.
const inyectado = F.nombreLimpio('factura.pdf\r\nSet-Cookie: robada=1');
log('Un salto de linea no llega a la cabecera', !/[\r\n]/.test(inyectado), JSON.stringify(inyectado));
log('Y las comillas no cierran el filename', !inyectado.includes('"'), JSON.stringify(inyectado));
log('Un nombre normal se respeta',
  F.nombreLimpio('Factura GYG julio 2026.pdf') === 'Factura GYG julio 2026.pdf',
  F.nombreLimpio('Factura GYG julio 2026.pdf'));
log('Un nombre vacio no deja el fichero sin nombre',
  F.nombreLimpio('') === 'factura', F.nombreLimpio(''));

// ---------- 3. Guardar de verdad, en disco ----------
const comoFile = (data, name, type) => ({
  size: data.length,
  name,
  type,
  arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
});

{
  const g = await F.guardarFichero(comoFile(PDF, 'Factura GYG.pdf', 'application/pdf'));
  log('Guarda el PDF y devuelve su huella',
    g.fileMime === 'application/pdf' && /^[a-f0-9]{64}$/.test(g.sha256), g.sha256.slice(0, 16) + '…');
  // El nombre en disco es NUESTRO: nada del original, ni siquiera la extension.
  log('El nombre en disco no viene del original',
    !g.storedName.includes('Factura') && /^[a-z0-9]+-[a-f0-9]{16}\.pdf$/.test(g.storedName),
    g.storedName);
  log('Y el fichero esta realmente en la carpeta',
    readdirSync(almacen).includes(g.storedName), `${readdirSync(almacen).length} ficheros`);

  const leido = await F.leerFichero(g.storedName);
  log('Se puede volver a leer igual', Buffer.from(PDF).equals(leido), `${leido.length} bytes`);

  // Dos ficheros distintos con el mismo nombre no se pisan.
  const g2 = await F.guardarFichero(comoFile(PDF, 'Factura GYG.pdf', 'application/pdf'));
  log('Dos subidas del mismo nombre no se pisan', g.storedName !== g2.storedName,
    `${g.storedName} vs ${g2.storedName}`);
  // Pero la huella es la misma: es lo que permite detectar el duplicado.
  log('Y el mismo contenido da la misma huella', g.sha256 === g2.sha256, g2.sha256.slice(0, 16) + '…');

  await F.borrarFichero(g2.storedName);
  log('Borrar quita el fichero del disco', !readdirSync(almacen).includes(g2.storedName));
}

// ---------- 4. Lo que NO se guarda ----------
{
  let error = '';
  try { await F.guardarFichero(comoFile(HTML, 'malo.pdf', 'application/pdf')); }
  catch (e) { error = e.message; }
  log('Un HTML con nombre .pdf y tipo PDF se rechaza', /PDF, JPG o PNG/.test(error), error);

  error = '';
  try { await F.guardarFichero(comoFile(bytes(), 'vacio.pdf', 'application/pdf')); }
  catch (e) { error = e.message; }
  log('Un fichero vacio se rechaza', /vac/i.test(error), error);

  error = '';
  const enorme = { ...comoFile(PDF, 'gordo.pdf', 'application/pdf'), size: F.MAX_BYTES + 1 };
  try { await F.guardarFichero(enorme); }
  catch (e) { error = e.message; }
  log('Uno que pasa del tope se rechaza antes de leerlo', /MB/.test(error), error);
}

// ---------- 5. Leer no puede salirse de la carpeta ----------
{
  let error = '';
  try { await F.leerFichero('../../../etc/passwd'); }
  catch (e) { error = e.message; }
  log('Leer con ../ no sale de la carpeta', /no válido/.test(error), error);

  error = '';
  try { await F.leerFichero('cualquiera.pdf'); }
  catch (e) { error = e.message; }
  log('Y un nombre que no siga nuestro patron tampoco', /no válido/.test(error), error);
}

rmSync(salida, { recursive: true, force: true });
rmSync(almacen, { recursive: true, force: true });

const fallos = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - fallos.length}/${results.length} pruebas OK ===`);
if (fallos.length) {
  console.log('FALLOS:');
  fallos.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail));
  process.exitCode = 1;
}
