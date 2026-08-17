/* NoTaxLost: atribución de QR.

   Añade cmp=<ref> a todos los enlaces de GetYourGuide (sin tocar partner_id),
   para que la reserva quede atribuida al establecimiento del QR. Expone
   window.ntlApplyAttribution() para re-aplicarlo tras pintar tarjetas por JS
   (si no, las dinámicas se quedarían sin cmp y se perdería la atribución).

   DOS FUENTES, Y NO SON LO MISMO:

   1. La direccion (?ref=EST-XXXXX). Es la visita que viene del QR. Se usa
      SIEMPRE, haya consentimiento o no: leer un parametro de la URL no guarda
      nada en el dispositivo, asi que no lo cubre el articulo 22.2 de la LSSI.
      Consecuencia practica importante: **si el turista rechaza las cookies, el
      establecimiento sigue cobrando esa visita**. Al hablar con los estancos
      conviene decirlo asi de claro.

   2. La cookie ntl_ref. Es la memoria entre visitas: que el turista vuelva
      semanas despues, ya sin el QR, y el local siga cobrando. Eso SI guarda
      algo en su movil, asi que solo se escribe y se lee con permiso expreso
      (categoria "afiliacion" de ntl-consent.js).

   Es decir: rechazar no apaga la atribucion, solo la memoria.
*/
(function () {
  // Un mes. Ver crm-web/deploy/atribucion-web.md antes de cambiarlo: el plazo
  // esta escrito en varios sitios y el navegador tiene la ultima palabra
  // (Safari recorta a 7 dias las cookies escritas por JavaScript).
  var DIAS = 30;

  function permiso() {
    // Sin el script de consentimiento cargado no se guarda nada. Fallar del
    // lado de no guardar es lo correcto: guardar sin permiso es la infraccion.
    return !!(window.ntlConsent && window.ntlConsent.tiene("afiliacion"));
  }

  function refDeUrl() {
    try {
      return new URLSearchParams(location.search).get("ref") || "";
    } catch (e) {
      return "";
    }
  }

  function refDeCookie() {
    var m = document.cookie.match(/(?:^|; )ntl_ref=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function recordar(ref) {
    document.cookie =
      "ntl_ref=" + encodeURIComponent(ref) +
      "; max-age=" + DIAS * 24 * 3600 +
      "; path=/; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");
  }

  function olvidar() {
    document.cookie = "ntl_ref=; max-age=0; path=/";
  }

  function getRef() {
    var deUrl = refDeUrl();
    if (deUrl) {
      if (permiso()) recordar(deUrl);
      return deUrl; // la visita del QR se atribuye con permiso o sin el
    }
    // Sin ?ref= en la direccion, la unica fuente es la cookie, y esa necesita
    // permiso tanto para escribirse como para leerse.
    return permiso() ? refDeCookie() : "";
  }

  // Idempotente: volver a fijar cmp sobre un enlace ya procesado es inofensivo.
  function apply() {
    var ref = getRef();
    if (!ref) return;
    document.querySelectorAll('a[href*="getyourguide."]').forEach(function (a) {
      try {
        var u = new URL(a.href);
        u.searchParams.set("cmp", ref);
        a.href = u.toString();
      } catch (e) {}
    });
  }

  // Exponer para llamarlo tras renderizar las tarjetas.
  window.ntlApplyAttribution = apply;

  // Fuente unica del ref para el resto de la pagina (el widget de ciudad de
  // tickets.html lo necesita). Si se duplicara la logica en otro sitio, un dia
  // una de las dos copias se quedaria sin la comprobacion de permiso.
  window.ntlRef = getRef;

  // Si el usuario acepta despues de cargar la pagina, guardar su ref y volver a
  // sellar los enlaces. Si retira el permiso, borrar la cookie: dejarla ahi
  // seria justo lo que dijo que no queria.
  if (window.ntlConsent && window.ntlConsent.alCambiar) {
    window.ntlConsent.alCambiar(function () {
      if (permiso()) {
        var r = refDeUrl();
        if (r) recordar(r);
      } else {
        olvidar();
      }
      apply();
    });
  }

  // Ejecutar una vez ahora (cubre enlaces estáticos presentes al cargar).
  apply();

  // Red de seguridad: si algún enlace de GYG se inyecta más tarde sin llamar a
  // apply() (widgets, carruseles), lo capturamos. Observamos childList; cambiar
  // a.href es un cambio de atributo, no dispara el observer -> sin bucles.
  if (window.MutationObserver) {
    var scheduled = false;
    var observer = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      setTimeout(function () { scheduled = false; apply(); }, 200);
    });
    var start = function () { observer.observe(document.body, { childList: true, subtree: true }); };
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start);
  }
})();
