/* Consentimiento de cookies y su efecto sobre la atribucion.

   La regla de negocio que vigila esta bateria es una sola y vale dinero:

     RECHAZAR LAS COOKIES NO PUEDE HACER QUE EL ESTABLECIMIENTO PIERDA SU VENTA.

   El codigo del local viaja en la direccion (?ref=), asi que la visita del QR
   se atribuye igual sin guardar nada. Lo unico que el rechazo tiene que apagar
   es la MEMORIA entre visitas. Si alguien "simplifica" ntl-attrib.js metiendo
   toda la atribucion detras del consentimiento, la web seguira pareciendo
   correcta y los estancos empezaran a cobrar de menos sin que nadie lo note.

   Lo otro que vigila es lo contrario: que sin permiso no se guarde NADA, que es
   la infraccion del articulo 22.2 de la LSSI.

   cd web && python3 -m http.server 8099 &
   node tests/test-consentimiento.mjs
*/
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const REF = 'EST-PRUEBA9';

const results = [];
function log(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -- ' + detail : ''}`);
}

const navegador = await chromium.launch();

/** Abre una pestaña limpia (sin cookies de la anterior). */
async function nuevaPagina() {
  const ctx = await navegador.newContext();
  const page = await ctx.newPage();
  // La pagina real carga widgets de GetYourGuide; no hacen falta y enlentecen.
  await page.route('**://*.getyourguide.*/**', (r) => r.abort());
  return { ctx, page };
}

const cookieDe = async (ctx, nombre) =>
  (await ctx.cookies()).find((c) => c.name === nombre) || null;

/** Inyecta un enlace de GYG y devuelve su href tras aplicar la atribucion. */
async function cmpDeUnEnlace(page) {
  return page.evaluate(() => {
    const a = document.createElement('a');
    a.href = 'https://www.getyourguide.com/x?partner_id=ABC';
    a.id = 'ntl-prueba';
    document.body.appendChild(a);
    window.ntlApplyAttribution();
    return new URL(document.getElementById('ntl-prueba').href).searchParams.get('cmp');
  });
}

// ---------- 1. El banner aparece y no se cuela nada antes ----------
{
  const { ctx, page } = await nuevaPagina();
  await page.goto(`${BASE}/tickets.html?ref=${REF}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  const banner = await page.getByRole('dialog', { name: /aviso de cookies/i }).count();
  log('Sale el aviso de cookies en la primera visita', banner === 1, `${banner} dialogos`);

  // Lo que exige la AEPD: rechazar tiene que costar lo mismo que aceptar.
  const aceptar = page.getByRole('button', { name: 'Aceptar' });
  const rechazar = page.getByRole('button', { name: 'Rechazar' });
  const ba = await aceptar.boundingBox();
  const br = await rechazar.boundingBox();
  log('Aceptar y Rechazar estan los dos a la vista', !!ba && !!br);
  log('Y tienen el mismo tamaño (no vale esconder Rechazar)',
    !!ba && !!br && Math.abs(ba.width - br.width) < 2 && Math.abs(ba.height - br.height) < 2,
    ba && br ? `${Math.round(ba.width)}x${Math.round(ba.height)} vs ${Math.round(br.width)}x${Math.round(br.height)}` : 'sin medir');
  log('Y estan a la misma altura, no uno escondido abajo',
    !!ba && !!br && Math.abs(ba.y - br.y) < 2);

  // Lo importante: antes de responder, NO puede haber cookie de atribucion.
  log('Antes de contestar no se ha guardado ninguna atribucion',
    (await cookieDe(ctx, 'ntl_ref')) === null);

  await ctx.close();
}

// ---------- 2. RECHAZAR: no se guarda nada, pero el local COBRA ----------
{
  const { ctx, page } = await nuevaPagina();
  await page.goto(`${BASE}/tickets.html?ref=${REF}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Rechazar' }).click();
  await page.waitForTimeout(200);

  log('Al rechazar no se guarda la cookie de atribucion',
    (await cookieDe(ctx, 'ntl_ref')) === null);

  const consent = await cookieDe(ctx, 'ntl_consent');
  log('Pero si se recuerda que dijo que no', !!consent && /afiliacion=0/.test(decodeURIComponent(consent.value)),
    consent ? decodeURIComponent(consent.value) : 'sin cookie');

  // ESTA ES LA PRUEBA QUE IMPORTA.
  const cmp = await cmpDeUnEnlace(page);
  log('Y AUN ASI el establecimiento cobra esta visita (cmp puesto)', cmp === REF, String(cmp));

  await ctx.close();
}

// ---------- 3. RECHAZAR: se pierde la memoria, no la venta ----------
{
  const { ctx, page } = await nuevaPagina();
  await page.goto(`${BASE}/tickets.html?ref=${REF}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Rechazar' }).click();
  await page.waitForTimeout(200);

  // Vuelve otro dia, ya sin el QR.
  await page.goto(`${BASE}/tickets.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  const cmp = await cmpDeUnEnlace(page);
  log('Si rechazo y vuelve sin QR, no hay atribucion (eso si se pierde)',
    cmp === null, String(cmp));
  await ctx.close();
}

// ---------- 4. ACEPTAR: se guarda y la memoria funciona ----------
{
  const { ctx, page } = await nuevaPagina();
  await page.goto(`${BASE}/tickets.html?ref=${REF}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Aceptar' }).click();
  await page.waitForTimeout(200);

  const c = await cookieDe(ctx, 'ntl_ref');
  log('Al aceptar si se guarda la atribucion', !!c && decodeURIComponent(c.value) === REF,
    c ? decodeURIComponent(c.value) : 'sin cookie');
  log('Con SameSite puesto', !!c && c.sameSite === 'Lax', c ? c.sameSite : '-');

  const dias = c ? Math.round((c.expires - Date.now() / 1000) / 86400) : 0;
  log('Y dura los 30 dias que dice la politica de cookies', dias >= 29 && dias <= 30, `${dias} dias`);

  // Vuelve otro dia sin el QR: ahora si tiene que acordarse.
  await page.goto(`${BASE}/tickets.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  log('Vuelve sin QR y el local sigue cobrando', (await cmpDeUnEnlace(page)) === REF);
  log('Y no se le vuelve a preguntar',
    (await page.getByRole('dialog', { name: /aviso de cookies/i }).count()) === 0);

  await ctx.close();
}

// ---------- 5. Se puede cambiar de idea, y borra lo guardado ----------
{
  const { ctx, page } = await nuevaPagina();
  await page.goto(`${BASE}/tickets.html?ref=${REF}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Aceptar' }).click();
  await page.waitForTimeout(200);
  log('Punto de partida: la cookie esta puesta', (await cookieDe(ctx, 'ntl_ref')) !== null);

  await page.locator('[data-ntl-cookies]').first().click();
  await page.waitForTimeout(200);
  log('El pie de pagina reabre la configuracion',
    (await page.getByRole('dialog', { name: /configuracion de cookies/i }).count()) === 1);

  await page.getByRole('button', { name: 'Rechazar todas' }).click();
  await page.waitForTimeout(200);
  // Retirar el permiso tiene que borrar de verdad, no solo dejar de escribir.
  log('Al retirar el permiso se BORRA la cookie ya guardada',
    (await cookieDe(ctx, 'ntl_ref')) === null);

  await ctx.close();
}

// ---------- 6. Las paginas legales existen y se enlazan ----------
{
  const { ctx, page } = await nuevaPagina();
  for (const [ruta, titulo] of [
    ['/privacidad.html', /privacidad/i],
    ['/cookies.html', /cookies/i],
    ['/aviso-legal.html', /aviso legal/i],
  ]) {
    const r = await page.goto(BASE + ruta, { waitUntil: 'domcontentloaded' });
    const h1 = await page.locator('h1').first().textContent();
    log(`Existe ${ruta} y titula bien`, r.status() === 200 && titulo.test(h1 || ''),
      `HTTP ${r.status()} · ${h1}`);
  }
  await ctx.close();
}

// ---------- 7. El aviso no puede tapar nada ----------
{
  const { ctx, page } = await nuevaPagina();
  await page.goto(`${BASE}/tickets.html?ref=${REF}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Con el aviso abierto, el final del documento tiene que seguir siendo
  // alcanzable: si el aviso lo tapa, se pierden reservas y no da ningun error.
  const hueco = await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom) || 0);
  const altoAviso = await page.evaluate(() => {
    const d = document.querySelector('[aria-label="Aviso de cookies"]');
    return d ? d.getBoundingClientRect().height : 0;
  });
  log('Con el aviso abierto se reserva hueco al final de la pagina',
    hueco > 0 && hueco >= altoAviso - 1, `hueco ${Math.round(hueco)}px / aviso ${Math.round(altoAviso)}px`);

  await page.getByRole('button', { name: 'Aceptar' }).click();
  await page.waitForTimeout(200);
  // Al cerrar hay que devolver EXACTAMENTE lo que habia, no poner 0: tickets.html
  // ya trae su propio hueco (pb-20). Ponerlo a cero le comeria 80px al pie.
  const inline = await page.evaluate(() => document.body.style.paddingBottom);
  const huecoDespues = await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom) || 0);
  log('Y al cerrarlo se devuelve el hueco propio de la pagina, no cero',
    inline === '' && huecoDespues === 80, `inline="${inline}" calculado=${huecoDespues}px`);

  await ctx.close();
}

await navegador.close();

const fallos = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - fallos.length}/${results.length} pruebas OK ===`);
if (fallos.length) {
  console.log('FALLOS:');
  fallos.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail));
  process.exitCode = 1;
}
