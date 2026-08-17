/* NoTaxLost: consentimiento de cookies.

   Por que existe: el articulo 22.2 de la LSSI obliga a pedir permiso antes de
   guardar nada en el dispositivo del visitante, salvo que sea imprescindible
   para lo que el usuario ha pedido. La cookie de atribucion (ntl_ref) no lo es
   —el turista pidio ver tickets, no que apuntemos a que establecimiento hay que
   pagarle— asi que necesita permiso previo.

   Lo importante del diseño: RECHAZAR NO PIERDE LA VENTA. El codigo del
   establecimiento viaja en la direccion (?ref=) y ntl-attrib.js lo usa igual
   para esa visita sin guardar nada. Lo unico que se pierde al rechazar es la
   memoria entre visitas. Esto hay que saberlo antes de tocar nada aqui: es lo
   que permite cumplir la ley sin dejar de pagar al establecimiento.

   Autonomo a proposito: sin dependencias y con estilos propios, para que se
   comporte igual en todas las paginas aunque cambie el CSS.
*/
(function () {
  "use strict";

  var COOKIE = "ntl_consent";
  // Un año. La AEPD recomienda renovar el consentimiento como mucho cada 24
  // meses (Guia de mayo de 2024); esto se queda holgadamente por debajo.
  var VIGENCIA = 365 * 24 * 3600;
  var VERSION = "1";

  // Categorias. "necesarias" no se puede desactivar: ahi solo esta la propia
  // eleccion del usuario, que hay que recordar para no volver a preguntarle.
  var CATEGORIAS = [
    {
      id: "afiliacion",
      titulo: "Publicidad y afiliacion",
      texto:
        "Recuerda el establecimiento por cuyo codigo QR has llegado, para que reciba " +
        "su parte de la comision si acabas reservando. Si lo rechazas la web funciona " +
        "igual: solo dejamos de recordarlo para futuras visitas.",
    },
  ];

  var azul = "#002B5B";
  var verde = "#00C853";
  var gris = "#666666";

  function leer() {
    var m = document.cookie.match(/(?:^|; )ntl_consent=([^;]*)/);
    if (!m) return null;
    try {
      var v = decodeURIComponent(m[1]).split(":");
      if (v[0] !== "v" + VERSION) return null; // version vieja: volver a preguntar
      var out = {};
      v.slice(1).forEach(function (par) {
        var kv = par.split("=");
        if (kv[0]) out[kv[0]] = kv[1] === "1";
      });
      return out;
    } catch (e) {
      return null;
    }
  }

  function guardar(decision) {
    var partes = ["v" + VERSION];
    CATEGORIAS.forEach(function (c) {
      partes.push(c.id + "=" + (decision[c.id] ? "1" : "0"));
    });
    // La fecha queda para poder acreditar cuando se dio el permiso.
    partes.push("ts=" + Math.floor(Date.now() / 1000));
    document.cookie =
      COOKIE + "=" + encodeURIComponent(partes.join(":")) +
      "; max-age=" + VIGENCIA +
      "; path=/; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");
    avisar();
  }

  var oyentes = [];
  function avisar() {
    var estado = leer();
    oyentes.forEach(function (cb) {
      try { cb(estado); } catch (e) {}
    });
  }

  // ---------- Interfaz publica ----------
  var api = {
    /** ¿Hay permiso para esta finalidad? Sin respuesta todavia = NO. */
    tiene: function (id) {
      var c = leer();
      return !!(c && c[id]);
    },
    /** ¿Ha contestado ya el usuario? */
    respondido: function () {
      return leer() !== null;
    },
    /** Avisa cuando el usuario acepta o cambia su eleccion. */
    alCambiar: function (cb) {
      if (typeof cb === "function") oyentes.push(cb);
    },
    /** Reabrir el panel: hace falta para poder retirar el permiso. */
    abrirPanel: function () {
      pintarPanel();
    },
  };
  window.ntlConsent = api;

  // ---------- Pintado ----------
  function boton(texto, principal) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = texto;
    // Aceptar y Rechazar tienen que ser igual de faciles: mismo tamaño, misma
    // zona y mismo peso visual. Si "Rechazar" es un enlace pequeño, la AEPD lo
    // considera consentimiento no valido.
    b.style.cssText =
      "flex:1 1 0;min-width:8.5rem;padding:.7rem 1.1rem;border:2px solid " + azul +
      ";border-radius:9999px;font:600 .95rem/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
      "cursor:pointer;transition:opacity .15s;" +
      (principal
        ? "background:" + azul + ";color:#fff;"
        : "background:#fff;color:" + azul + ";");
    b.onmouseenter = function () { b.style.opacity = ".85"; };
    b.onmouseleave = function () { b.style.opacity = "1"; };
    return b;
  }

  function caja() {
    var d = document.createElement("div");
    d.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:2147483000;" +
      "background:#fff;border-top:3px solid " + verde + ";" +
      "box-shadow:0 -8px 30px rgba(0,0,0,.18);padding:1.1rem 1.25rem;" +
      "font:400 .9rem/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;";
    return d;
  }

  var abierto = null;

  // El aviso va fijo abajo, asi que taparia lo que hubiera debajo: en la pagina
  // de tickets, justo el boton de reservar. Se compensa con un hueco al final
  // del documento mientras esta abierto. Sin esto el banner cuesta reservas y
  // no se entera nadie, porque la pagina "se ve bien".
  var huecoPrevio = null;
  function ajustarHueco() {
    if (!abierto) return;
    var alto = abierto.getBoundingClientRect().height;
    if (huecoPrevio === null) huecoPrevio = document.body.style.paddingBottom || "";
    document.body.style.paddingBottom = Math.ceil(alto) + "px";
  }

  function cerrar() {
    if (abierto && abierto.parentNode) abierto.parentNode.removeChild(abierto);
    abierto = null;
    if (huecoPrevio !== null) {
      document.body.style.paddingBottom = huecoPrevio;
      huecoPrevio = null;
    }
  }

  function pintarBanner() {
    cerrar();
    var d = caja();
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-label", "Aviso de cookies");

    var wrap = document.createElement("div");
    wrap.style.cssText = "max-width:60rem;margin:0 auto;display:flex;flex-direction:column;gap:.9rem;";

    var t = document.createElement("div");
    t.innerHTML =
      '<strong style="color:' + azul + ';font-size:1rem;">Cookies</strong><br>' +
      "Usamos una cookie propia para recordar el establecimiento por cuyo QR has " +
      "llegado, y asi pagarle su parte si reservas. No la usamos para perfilarte ni " +
      "la compartimos con terceros. Si la rechazas, la web funciona igual. " +
      '<a href="/cookies" style="color:' + azul + ';text-decoration:underline;">Politica de cookies</a> · ' +
      '<a href="/privacidad" style="color:' + azul + ';text-decoration:underline;">Privacidad</a>';
    wrap.appendChild(t);

    var fila = document.createElement("div");
    fila.style.cssText = "display:flex;flex-wrap:wrap;gap:.6rem;align-items:stretch;";

    var aceptar = boton("Aceptar", true);
    aceptar.onclick = function () {
      var todo = {};
      CATEGORIAS.forEach(function (c) { todo[c.id] = true; });
      guardar(todo);
      cerrar();
    };

    var rechazar = boton("Rechazar", false);
    rechazar.onclick = function () {
      guardar({}); // todas a 0
      cerrar();
    };

    var config = boton("Configurar", false);
    config.style.flex = "0 0 auto";
    config.style.minWidth = "7rem";
    config.onclick = pintarPanel;

    fila.appendChild(aceptar);
    fila.appendChild(rechazar);
    fila.appendChild(config);
    wrap.appendChild(fila);
    d.appendChild(wrap);
    document.body.appendChild(d);
    abierto = d;
    ajustarHueco();
  }

  function pintarPanel() {
    cerrar();
    var estado = leer() || {};
    var d = caja();
    d.style.maxHeight = "80vh";
    d.style.overflowY = "auto";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-label", "Configuracion de cookies");

    var wrap = document.createElement("div");
    wrap.style.cssText = "max-width:60rem;margin:0 auto;display:flex;flex-direction:column;gap:1rem;";

    var t = document.createElement("div");
    t.innerHTML =
      '<strong style="color:' + azul + ';font-size:1rem;">Configuracion de cookies</strong>';
    wrap.appendChild(t);

    var nec = document.createElement("div");
    nec.style.cssText = "border:1px solid #e5e7eb;border-radius:.75rem;padding:.8rem 1rem;";
    nec.innerHTML =
      '<div style="font-weight:600;color:' + azul + ';">Necesarias <span style="font-weight:400;color:' + gris + ';">(siempre activas)</span></div>' +
      '<div style="color:' + gris + ';">Solo guardamos tu eleccion sobre estas cookies, para no volver a preguntarte en cada pagina.</div>';
    wrap.appendChild(nec);

    var casillas = {};
    CATEGORIAS.forEach(function (c) {
      var box = document.createElement("label");
      box.style.cssText =
        "display:flex;gap:.75rem;align-items:flex-start;border:1px solid #e5e7eb;" +
        "border-radius:.75rem;padding:.8rem 1rem;cursor:pointer;";
      var chk = document.createElement("input");
      chk.type = "checkbox";
      // Nunca premarcada si el usuario no ha dicho que si.
      chk.checked = !!estado[c.id];
      chk.style.cssText = "margin-top:.25rem;width:1.1rem;height:1.1rem;accent-color:" + verde + ";";
      casillas[c.id] = chk;
      var txt = document.createElement("div");
      txt.innerHTML =
        '<div style="font-weight:600;color:' + azul + ';">' + c.titulo + "</div>" +
        '<div style="color:' + gris + ';">' + c.texto + "</div>";
      box.appendChild(chk);
      box.appendChild(txt);
      wrap.appendChild(box);
    });

    var fila = document.createElement("div");
    fila.style.cssText = "display:flex;flex-wrap:wrap;gap:.6rem;";

    var guardarBtn = boton("Guardar eleccion", true);
    guardarBtn.onclick = function () {
      var d2 = {};
      CATEGORIAS.forEach(function (c) { d2[c.id] = casillas[c.id].checked; });
      guardar(d2);
      cerrar();
    };
    var rechazarTodo = boton("Rechazar todas", false);
    rechazarTodo.onclick = function () {
      guardar({});
      cerrar();
    };

    fila.appendChild(guardarBtn);
    fila.appendChild(rechazarTodo);
    wrap.appendChild(fila);
    d.appendChild(wrap);
    document.body.appendChild(d);
    abierto = d;
    ajustarHueco();
  }

  // Si cambia el tamaño de la ventana, el aviso cambia de alto (se apilan los
  // botones en movil) y el hueco tiene que seguirlo.
  window.addEventListener("resize", ajustarHueco);

  // Delegacion en document, no un listener por enlace: este script se carga
  // antes de que exista el pie de pagina en tickets.html, y ademas asi funciona
  // con cualquier enlace que se pinte despues.
  document.addEventListener("click", function (ev) {
    var el = ev.target && ev.target.closest && ev.target.closest("[data-ntl-cookies]");
    if (!el) return;
    ev.preventDefault();
    pintarPanel();
  });

  function arrancar() {
    // Solo se pregunta si no ha contestado antes.
    if (!api.respondido()) pintarBanner();
  }

  if (document.body) arrancar();
  else document.addEventListener("DOMContentLoaded", arrancar);
})();
