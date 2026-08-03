/* NoTaxLost — Planes curados ("Ready-made plans").
   Vista aparte, no una lista dentro del catalogo: tarjetas con las fotos de sus
   paradas y una descripcion. Al elegir una se abre su detalle con los pasos en
   orden y la nota nuestra de cada uno.

   Como en el recomendador: tras pintar hay que llamar a
   window.ntlApplyAttribution(), o los enlaces nuevos se quedan sin cmp y se
   pierde la atribucion al establecimiento. */
(function () {
  'use strict';

  var esc = function (v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  function norm(v) {
    return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function slotNow(d) {
    var h = d.getHours();
    if (h >= 5 && h < 11) return 'morning';
    if (h >= 11 && h < 16) return 'afternoon';
    if (h >= 16 && h < 21) return 'evening';
    return 'night';
  }

  function zoneFromUrl() {
    var p = new URLSearchParams(location.search);
    return norm(p.get('zona') || p.get('zone') || p.get('provincia') || p.get('province') || '');
  }

  // Los planes de la zona del cartel primero, luego los que encajan con la hora.
  function rank(plans, zone, slot, catalog) {
    var provOfZone = '';
    if (zone) {
      for (var i = 0; i < catalog.length; i++) {
        if (norm(catalog[i].city) === zone || norm(catalog[i].provincia) === zone) {
          provOfZone = catalog[i].provincia; break;
        }
      }
    }
    function score(p) {
      var s = 0;
      if (zone && norm(p.city) === zone) s += 4;
      else if (provOfZone && p.provincia === provOfZone) s += 2;
      if (p.momento.indexOf(slot) !== -1) s += 1;
      return s;
    }
    return plans.slice().sort(function (a, b) { return score(b) - score(a); });
  }

  var STAR = '<svg style="display:inline-block;width:.7rem;height:.7rem;margin-top:-2px;color:#facc15" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.363 1.118l1.287 3.958c.3.921-.771 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.175 0l-3.37 2.448c-.768.57-1.838-.197-1.539-1.118l1.286-3.958a1 1 0 00-.362-1.118L2.02 9.383c-.784-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.286-3.958z"/></svg>';

  // ---------- Tarjeta de plan: collage con las fotos de sus paradas ----------
  function cardHtml(pl) {
    var fotos = pl.pasos.map(function (p) { return p.imagen; });
    var extra = fotos.length - 3;
    var lado = fotos.slice(1, 3).map(function (src, i) {
      var mas = (i === 1 && extra > 0)
        ? '<span class="ntl-pcard-more">+' + extra + '</span>' : '';
      return '<span class="ntl-pcard-cell"><img src="' + esc(src) + '" alt="" loading="lazy">' + mas + '</span>';
    }).join('');

    return '' +
      '<button class="ntl-pcard" type="button" data-plan="' + esc(pl.id) + '">' +
        '<span class="ntl-pcard-photos">' +
          '<span class="ntl-pcard-cell ntl-pcard-hero"><img src="' + esc(fotos[0]) + '" alt="" loading="lazy"></span>' +
          '<span class="ntl-pcard-side">' + lado + '</span>' +
        '</span>' +
        '<span class="ntl-pcard-body">' +
          '<span class="ntl-pcard-title">' + esc(pl.titulo) + '</span>' +
          '<span class="ntl-pcard-sub">' + esc(pl.subtitulo) + '</span>' +
          '<span class="ntl-pcard-meta">' + esc(pl.duracion) + ' &middot; ' +
            pl.pasos.length + ' stops &middot; from ' + pl.desde + '&euro;</span>' +
        '</span>' +
        '<span class="ntl-pcard-cta">See the plan' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>' +
        '</span>' +
      '</button>';
  }

  // ---------- La cesta del plan ----------
  /* GetYourGuide no tiene cesta para afiliados: cada enlace vende UNA actividad
     y no hay URL que acepte varios tour_id. La Partner API si lo permitiria,
     pero pide 100.000 visitas al mes. Asi que no se puede pagar el plan de una
     vez.

     Lo que si se puede arreglar es el problema de verdad: que al ir a la
     segunda parada ya no sabes por donde ibas. La cesta vive aqui, guarda que
     paradas llevas reservadas y sobrevive a irse a GYG y volver. Las reservas
     siguen siendo tres, pero el plan deja de perderse. */
  var CESTA_KEY = 'ntl_cesta_';

  function leerCesta(id) {
    try {
      var v = JSON.parse(window.localStorage.getItem(CESTA_KEY + id) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }   // modo privado o almacenamiento lleno
  }

  function guardarCesta(id, tids) {
    try { window.localStorage.setItem(CESTA_KEY + id, JSON.stringify(tids)); } catch (e) {}
  }

  // ---------- Detalle de un plan ----------
  var tourIdOf = function (u) { return (String(u).match(/-t(\d+)/) || [])[1] || ''; };

  // El paso ya no es un <a> entero: dentro hay un boton para desplegar el
  // widget de disponibilidad, y no se pueden anidar elementos interactivos.
  function stepHtml(p, i, hechos) {
    var tid = tourIdOf(p.url);
    var hecho = tid && hechos.indexOf(tid) !== -1;
    // Los enlaces del plan abren en otra pestaña a proposito: el plan es el
    // sitio de trabajo y no se puede perder al ir a reservar la primera parada.
    return '' +
      '<div class="ntl-step' + (hecho ? ' is-hecho' : '') + '" data-tour="' + esc(tid) + '">' +
        '<div class="ntl-step-main">' +
          '<div class="ntl-step-n">' + (hecho ? CHECK : (i + 1)) + '</div>' +
          '<a class="ntl-step-img" href="' + esc(p.url) + '" target="_blank" rel="noopener"' +
            ' tabindex="-1" aria-hidden="true">' +
            '<img src="' + esc(p.imagen) + '" alt="" loading="lazy"></a>' +
          '<div class="ntl-step-body">' +
            '<a class="ntl-step-title" href="' + esc(p.url) + '" target="_blank" rel="noopener">' +
              esc(p.titulo) + '</a>' +
            (p.nota ? '<p class="ntl-step-note">' + esc(p.nota) + '</p>' : '') +
            '<div class="ntl-step-meta">' +
              (p.rating ? '<b>' + STAR + ' ' + esc(p.rating) + '</b>' : '') +
              '<b>' + esc(p.precioDisplay) + '</b>' +
              (tid ? '<button type="button" class="ntl-step-dates" data-tour="' + esc(tid) +
                     '" data-url="' + esc(p.url) + '">Check dates &amp; live price</button>' : '') +
              '<button type="button" class="ntl-step-deshacer" data-desmarcar>Not booked yet</button>' +
            '</div>' +
          '</div>' +
          '<a class="ntl-step-book" href="' + esc(p.url) + '" target="_blank" rel="noopener"' +
            ' data-marcar>Book</a>' +
        '</div>' +
        '<div class="ntl-step-avail" hidden></div>' +
      '</div>';
  }

  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';

  /** La barra de la cesta: cuantas paradas llevas y cual toca ahora. */
  function cestaHtml(pl, hechos) {
    var total = pl.pasos.length;
    var n = pl.pasos.filter(function (p) {
      return hechos.indexOf(tourIdOf(p.url)) !== -1;
    }).length;
    var siguiente = null;
    for (var i = 0; i < pl.pasos.length; i++) {
      if (hechos.indexOf(tourIdOf(pl.pasos[i].url)) === -1) { siguiente = i; break; }
    }
    var completo = n === total;

    return '<div class="ntl-cesta' + (completo ? ' is-completo' : '') + '">' +
      '<div class="ntl-cesta-txt">' +
        '<b>' + (completo ? 'Your day is booked' : n + ' of ' + total + ' stops booked') + '</b>' +
        '<span>' + (completo
          ? 'Keep this page: your plan stays here.'
          : 'Book them one at a time — we keep your place.') + '</span>' +
      '</div>' +
      '<div class="ntl-cesta-barra" role="progressbar" aria-valuenow="' + n +
        '" aria-valuemin="0" aria-valuemax="' + total + '">' +
        '<i style="width:' + Math.round((n / total) * 100) + '%"></i>' +
      '</div>' +
      (completo
        ? '<button type="button" class="ntl-cesta-reset" data-reset>Start over</button>'
        : '<button type="button" class="ntl-cesta-go" data-siguiente="' + siguiente + '">' +
            'Book stop ' + (siguiente + 1) + '</button>') +
      '</div>';
  }

  // Monta el widget de disponibilidad de GYG para una actividad.
  // Ojo: el script de GetYourGuide busca los data-gyg-href al cargar la pagina;
  // este div se inyecta despues, asi que puede no verlo. Por eso hay red de
  // seguridad: si en unos segundos no ha aparecido el iframe, dejamos un enlace
  // normal a la actividad, que siempre funciona.
  function mountAvailability(box, tourId, url) {
    var ref = currentRef();
    box.innerHTML =
      '<div data-gyg-href="https://widget.getyourguide.com/default/availability.frame"' +
      ' data-gyg-tour-id="' + esc(tourId) + '"' +
      ' data-gyg-locale-code="en-US" data-gyg-currency="EUR"' +
      ' data-gyg-widget="availability" data-gyg-variant="horizontal"' +
      ' data-gyg-partner-id="IBO5PAK"' +
      (ref ? ' data-gyg-cmp="' + esc(ref) + '"' : '') + '>' +
      '<span class="ntl-avail-loading">Loading live availability…</span></div>';

    setTimeout(function () {
      if (box.querySelector('iframe')) return; // el widget monto bien
      box.innerHTML = '<a class="ntl-avail-fallback" href="' + esc(url) + '">' +
        'Check dates and live price on GetYourGuide' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></a>';
      if (typeof window.ntlApplyAttribution === 'function') window.ntlApplyAttribution();
    }, 3500);
  }

  // El mismo ref que usa ntl-attrib.js, para sellar el cmp en el widget.
  function currentRef() {
    var r = new URLSearchParams(location.search).get('ref');
    if (r) return r;
    var m = document.cookie.match(/(?:^|; )ntl_ref=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  // El catalogo tambien monta este widget (en una ventana modal, porque en una
  // rejilla no se puede desplegar en linea). Se comparte para no duplicar ni la
  // atribucion ni la red de seguridad.
  window.ntlMountAvailability = mountAvailability;

  // La navegacion hacia atras vive en la cabecera (ntlSetBack), no aqui.
  // El detalle no lleva el hero azul del catalogo: su portada son las fotos del
  // propio plan, que es lo que de verdad lo vende.
  function detailHtml(pl, hechos) {
    var fotos = pl.pasos.map(function (p) { return p.imagen; }).slice(0, 3);
    var banner = fotos.map(function (src, i) {
      return '<span class="ntl-pd-cell' + (i === 0 ? ' ntl-pd-cell-main' : '') + '">' +
        '<img src="' + esc(src) + '" alt="" loading="lazy"></span>';
    }).join('');

    return '' +
      '<div class="ntl-pd-banner">' + banner + '</div>' +
      '<div class="ntl-pd-head">' +
        '<span class="ntl-pv-eyebrow">' + esc(pl.duracion) + ' &middot; ' + pl.pasos.length +
          ' stops &middot; from ' + pl.desde + '&euro;</span>' +
        '<h2 class="ntl-pv-title">' + esc(pl.titulo) + '</h2>' +
        '<p class="ntl-pv-sub">' + esc(pl.subtitulo) + '</p>' +
      '</div>' +
      cestaHtml(pl, hechos) +
      '<div class="ntl-pv-steps">' + pl.pasos.map(function (p, i) {
        return stepHtml(p, i, hechos);
      }).join('') + '</div>';
  }

  function init() {
    var grid = document.getElementById('plansGrid');
    var detail = document.getElementById('planDetail');
    var intro = document.getElementById('plansIntro');
    if (!grid || !detail) return;

    var plans = Array.isArray(window.NTL_PLANS) ? window.NTL_PLANS : [];
    if (!plans.length) return;

    var catalog = Array.isArray(window.NTL_CATALOG) ? window.NTL_CATALOG : [];
    var ordered = rank(plans, zoneFromUrl(), slotNow(new Date()), catalog);
    var byId = {};
    ordered.forEach(function (p) { byId[p.id] = p; });

    grid.innerHTML = ordered.map(cardHtml).join('');

    function showGrid() {
      abierto = null;
      detail.hidden = true;
      detail.innerHTML = '';
      grid.hidden = false;
      if (intro) intro.hidden = false;
      // La flecha de la cabecera vuelve a llevar al catalogo.
      if (typeof window.ntlSetBack === 'function') window.ntlSetBack('plans');
    }

    // Plan abierto ahora mismo y sus paradas ya reservadas. Vive aqui y no
    // dentro de showDetail para que el oyente de la cesta se enganche una sola
    // vez: si se enganchase en cada apertura, a la segunda cada clic contaria
    // por dos.
    var abierto = null;   // { pl, hechos }

    /* Se actualizan los trozos afectados en vez de repintar el detalle entero:
       si el cliente tiene abierto el widget de disponibilidad de una parada, un
       repintado se lo cerraria justo cuando esta eligiendo dia. */
    function refrescarCesta() {
      var vieja = detail.querySelector('.ntl-cesta');
      if (!vieja || !abierto) return;
      var tmp = document.createElement('div');
      tmp.innerHTML = cestaHtml(abierto.pl, abierto.hechos);
      vieja.replaceWith(tmp.firstChild);
    }

    function marcar(tid, hecho) {
      if (!tid || !abierto) return;
      var i = abierto.hechos.indexOf(tid);
      if (hecho && i === -1) abierto.hechos.push(tid);
      if (!hecho && i !== -1) abierto.hechos.splice(i, 1);
      guardarCesta(abierto.pl.id, abierto.hechos);

      var paso = detail.querySelector('.ntl-step[data-tour="' + tid + '"]');
      if (paso) {
        paso.classList.toggle('is-hecho', hecho);
        var n = paso.querySelector('.ntl-step-n');
        var pos = Array.prototype.indexOf.call(detail.querySelectorAll('.ntl-step'), paso);
        if (n) n.innerHTML = hecho ? CHECK : String(pos + 1);
      }
      refrescarCesta();
    }

    /* La cesta. Pulsar "Book" abre GetYourGuide en otra pestaña y da la parada
       por reservada: es lo que acaba de hacer el cliente. Si se arrepiente,
       "Not booked yet" lo deshace — el estado es suyo. */
    detail.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t.closest || !abierto) return;

      var book = t.closest('[data-marcar]');
      if (book) { marcar(book.closest('.ntl-step').dataset.tour, true); return; }

      var undo = t.closest('[data-desmarcar]');
      if (undo) { marcar(undo.closest('.ntl-step').dataset.tour, false); return; }

      var go = t.closest('[data-siguiente]');
      if (go) {
        var paso = detail.querySelectorAll('.ntl-step')[parseInt(go.dataset.siguiente, 10)];
        if (!paso) return;
        paso.scrollIntoView({ behavior: 'smooth', block: 'center' });
        paso.classList.remove('ntl-pop');
        void paso.offsetWidth;
        paso.classList.add('ntl-pop');
        return;
      }

      if (t.closest('[data-reset]')) {
        abierto.hechos.slice().forEach(function (tid) { marcar(tid, false); });
      }
    });

    function showDetail(id) {
      var pl = byId[id];
      if (!pl) return;
      abierto = { pl: pl, hechos: leerCesta(id) };

      detail.innerHTML = detailHtml(pl, abierto.hechos);
      grid.hidden = true;
      if (intro) intro.hidden = true;
      detail.hidden = false;

      // CRITICO: los enlaces de los pasos acaban de crearse.
      if (typeof window.ntlApplyAttribution === 'function') window.ntlApplyAttribution();

      // "Check dates": despliega el widget de disponibilidad de esa parada.
      // Uno cada vez: son iframes y no conviene cargar tres a la vez.
      detail.querySelectorAll('.ntl-step-dates').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var box = btn.closest('.ntl-step').querySelector('.ntl-step-avail');
          if (!box.hidden) { box.hidden = true; box.innerHTML = ''; btn.classList.remove('is-open'); return; }
          detail.querySelectorAll('.ntl-step-avail').forEach(function (b) { b.hidden = true; b.innerHTML = ''; });
          detail.querySelectorAll('.ntl-step-dates').forEach(function (b) { b.classList.remove('is-open'); });
          box.hidden = false;
          btn.classList.add('is-open');
          mountAvailability(box, btn.dataset.tour, btn.dataset.url);
        });
      });

      // Desde el detalle, la flecha vuelve a la lista de planes.
      if (typeof window.ntlSetBack === 'function') window.ntlSetBack('detail', showGrid);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    grid.addEventListener('click', function (ev) {
      var card = ev.target.closest ? ev.target.closest('.ntl-pcard') : null;
      if (card && grid.contains(card)) showDetail(card.dataset.plan);
    });

    // Al volver al catalogo, el detalle se cierra: la proxima vez se entra por
    // la rejilla de planes, no por donde se dejo.
    window.ntlPlansReset = showGrid;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
