/* NoTaxLost: atribución de QR.
   Guarda ?ref= en una cookie de 30 días y añade cmp=<ref> a todos los enlaces de
   GetYourGuide (sin tocar partner_id). Expone window.ntlApplyAttribution() para
   poder re-aplicarlo tras pintar tarjetas por JS (si no, las tarjetas dinámicas
   se quedarían sin cmp y se perdería la atribución al establecimiento). */
(function () {
  function getRef() {
    var ref = new URLSearchParams(location.search).get("ref");
    if (ref) {
      document.cookie = "ntl_ref=" + encodeURIComponent(ref) +
        "; max-age=" + 30 * 24 * 3600 + "; path=/";
    } else {
      var m = document.cookie.match(/(?:^|; )ntl_ref=([^;]*)/);
      if (m) ref = decodeURIComponent(m[1]);
    }
    return ref;
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
