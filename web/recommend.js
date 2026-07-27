/* NoTaxLost — "Don't know what to visit? We do."
   Recomendador contextual: elige actividades segun la hora del dia, el dia de
   la semana y la zona del cartel QR (?zona=), sin preguntar nada al usuario.
   El boton "Surprise me" vuelve a tirar con mas aleatoriedad.

   No necesita servidor: puntua sobre window.NTL_CATALOG (generado desde
   catalog.csv). Tras pintar las tarjetas llama a window.ntlApplyAttribution()
   para que los enlaces recien creados lleven el cmp del establecimiento. */
(function () {
  'use strict';

  // ---------- Contexto: franja horaria ----------
  // Cada franja prioriza unas categorias y unas palabras clave.
  var SLOTS = [
    {
      id: 'morning', from: 5, to: 11,
      label: 'this morning',
      cats: { culture: 3, tours: 3, sea: 1, food: 0 },
      words: ['skip-the-line', 'ticket', 'museum', 'guided', 'montserrat', 'day trip', 'breakfast', 'market'],
    },
    {
      id: 'afternoon', from: 11, to: 16,
      label: 'this afternoon',
      cats: { sea: 3, tours: 3, culture: 2, food: 1 },
      words: ['kayak', 'snorkel', 'jet ski', 'beach', 'boat', 'bike', 'cable car', 'park'],
    },
    {
      id: 'evening', from: 16, to: 21,
      label: 'tonight',
      cats: { food: 3, sea: 2, culture: 1, tours: 1 },
      words: ['sunset', 'tapas', 'flamenco', 'dinner', 'wine', 'vermouth', 'catamaran', 'concert', 'show'],
    },
    {
      id: 'night', from: 21, to: 29, // 29 = 5h del dia siguiente
      label: 'tonight',
      cats: { food: 3, culture: 1, sea: 1, tours: 0 },
      words: ['night', 'party', 'club', 'crawl', 'bar', 'flamenco', 'show', 'speakeasy', 'nightlife'],
    },
  ];

  function currentSlot(d) {
    var h = d.getHours();
    for (var i = 0; i < SLOTS.length; i++) {
      var s = SLOTS[i];
      if (s.to > 24) { if (h >= s.from || h < s.to - 24) return s; }
      else if (h >= s.from && h < s.to) return s;
    }
    return SLOTS[0];
  }

  // ---------- Contexto: zona del cartel QR ----------
  // El CRM graba en el QR la ciudad del establecimiento (?zona=lloret-de-mar).
  // No mantenemos una lista fija de ciudades: se resuelve contra las que
  // realmente existen en el catalogo, asi funciona cualquier ciudad nueva sin
  // tocar este archivo. Solo quedan a mano los alias que no son una ciudad.
  var ZONE_ALIASES = {
    costadaurada: { province: 'tarragona', city: 'costadaurada', name: 'Costa Daurada' },
    costadorada: { province: 'tarragona', city: 'costadaurada', name: 'Costa Daurada' },
    costabrava: { province: 'girona', city: null, name: 'Costa Brava' },
  };

  // Compara sin acentos, guiones ni espacios: "Lloret de Mar", "lloret-de-mar"
  // y "lloretdemar" son la misma zona.
  function norm(v) {
    return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function titleCase(slug) {
    return String(slug).split(/[-\s]+/).filter(Boolean).map(function (w) {
      return w.length <= 2 ? w : w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  function readZone(catalog) {
    var p = new URLSearchParams(location.search);
    var raw = p.get('zona') || p.get('zone') || p.get('provincia') || p.get('province') || '';
    var z = norm(raw);
    if (!z) return null;

    if (ZONE_ALIASES[z]) {
      var al = ZONE_ALIASES[z];
      return { province: al.province, city: al.city, name: al.name };
    }

    // ¿Coincide con la ciudad de alguna actividad?
    for (var i = 0; i < catalog.length; i++) {
      if (norm(catalog[i].city) === z) {
        return { province: catalog[i].provincia, city: catalog[i].city, name: titleCase(catalog[i].city) };
      }
    }
    // ¿Y con una provincia?
    for (var j = 0; j < catalog.length; j++) {
      if (norm(catalog[j].provincia) === z) {
        return { province: catalog[j].provincia, city: null, name: titleCase(catalog[j].provincia) };
      }
    }
    // Ciudad sin actividades propias: no sabemos situarla, seguimos sin zona.
    return null;
  }

  // ---------- Puntuacion ----------
  function score(a, slot, place, jitter) {
    var s = 0;
    var hay = ((a.titulo || '') + ' ' + (a.descripcion || '') + ' ' + (a.keywords || '') +
      ' ' + (a.etiquetaPie || '')).toLowerCase();

    // Encaje con la franja horaria
    s += (slot.cats[a.categoria] || 0) * 2.2;
    for (var i = 0; i < slot.words.length; i++) {
      if (hay.indexOf(slot.words[i]) !== -1) { s += 2.0; break; }
    }

    // Proximidad a la zona del cartel: la ciudad pesa mas que la provincia
    if (place) {
      if (place.city && a.city === place.city) s += 6;
      else if (place.city === 'costadaurada' && (a.city === 'salou' || a.city === 'cambrils')) s += 6;
      else if (a.provincia === place.province) s += 3.5;
      else s -= 1.5;
    }

    // Calidad y tiron
    s += (parseFloat(a.rating) || 0) * 1.6;
    if (a.trending) s += 1.2;

    // Los precios extremos encajan mal en una recomendacion rapida
    var pr = parseFloat(a.precio) || 0;
    if (pr > 300) s -= 4;

    return s + Math.random() * jitter;
  }

  // Palabras poco distintivas: no sirven para detectar que dos fichas son del
  // mismo sitio (aparecen en decenas de titulos).
  var STOP = ['ticket', 'tickets', 'tour', 'tours', 'entry', 'guided', 'experience',
    'skip', 'line', 'private', 'cruise', 'trip', 'visit', 'access', 'combo', 'pass',
    'walking', 'night', 'party', 'small', 'group', 'hidden', 'included', 'option'];

  // Palabras significativas del titulo, sin la ciudad/provincia de la propia
  // ficha (si no, "Salou: X" y "Salou: Y" pareceran el mismo sitio).
  function venueWords(a) {
    var own = [String(a.city || ''), String(a.provincia || '')].map(function (s) { return s.toLowerCase(); });
    return String(a.titulo || '').toLowerCase().split(/[^a-zàâäéèêëíîïóôöúûüçñ]+/i)
      .filter(function (w) {
        return w.length >= 5 && STOP.indexOf(w) === -1 && own.indexOf(w) === -1;
      });
  }

  // Evita recomendar tres cosas del mismo tipo o del mismo sitio (p. ej. dos
  // entradas distintas de PortAventura seguidas).
  function pickDiverse(list, n) {
    var out = [], cats = {}, words = {};
    function conflicts(a) {
      if ((cats[a.categoria] || 0) >= 1) return true;
      var w = venueWords(a);
      for (var k = 0; k < w.length; k++) if (words[w[k]]) return true;
      return false;
    }
    function take(a) {
      cats[a.categoria] = (cats[a.categoria] || 0) + 1;
      venueWords(a).forEach(function (w) { words[w] = true; });
      out.push(a);
    }
    for (var i = 0; i < list.length && out.length < n; i++) if (!conflicts(list[i])) take(list[i]);
    // Segunda pasada: si no llegamos a n, relajamos y solo evitamos repetir sitio.
    for (var j = 0; j < list.length && out.length < n; j++) {
      var a = list[j];
      if (out.indexOf(a) !== -1) continue;
      var w = venueWords(a), dup = false;
      for (var k2 = 0; k2 < w.length; k2++) if (words[w[k2]]) { dup = true; break; }
      if (!dup) take(a);
    }
    for (var m = 0; m < list.length && out.length < n; m++) {
      if (out.indexOf(list[m]) === -1) out.push(list[m]);
    }
    return out;
  }

  // ---------- Render ----------
  var esc = function (v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  // Estrella en SVG inline: no depende de app.css (build purgado de Tailwind).
  var STAR = '<svg style="display:inline-block;width:.75rem;height:.75rem;margin-top:-2px;color:#facc15" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.363 1.118l1.287 3.958c.3.921-.771 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.175 0l-3.37 2.448c-.768.57-1.838-.197-1.539-1.118l1.286-3.958a1 1 0 00-.362-1.118L2.02 9.383c-.784-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.286-3.958z"/></svg>';

  function pickHtml(a, reason) {
    return '' +
      '<a href="' + esc(a.url) + '" class="ntl-pick">' +
        '<div class="ntl-pick-img">' +
          '<img src="' + esc(a.imagen) + '" alt="' + esc(a.titulo) + '" loading="lazy">' +
        '</div>' +
        '<div class="ntl-pick-body">' +
          '<div class="ntl-pick-reason">' + esc(reason) + '</div>' +
          '<h3 class="ntl-pick-title">' + esc(a.titulo) + '</h3>' +
          '<div class="ntl-pick-meta">' +
            (a.rating ? '<b>' + STAR + ' ' + esc(a.rating) + '</b>' : '') +
            '<b>' + esc(a.precioDisplay) + '</b>' +
          '</div>' +
        '</div>' +
      '</a>';
  }

  // Motivo corto que explica por que se recomienda (el "nosotros si").
  // `used` evita que las tres tarjetas muestren la misma etiqueta.
  function reasonFor(a, slot, place, used) {
    var near = place && (a.city === place.city ||
      (place.city === 'costadaurada' && (a.city === 'salou' || a.city === 'cambrils')));

    var hay = ((a.titulo || '') + ' ' + (a.keywords || '')).toLowerCase();
    var isSunset = /sunset|sail|catamaran|boat|cruise/.test(hay);

    var opts = [];
    if (near) opts.push('Right here in ' + place.name);
    if (slot.id === 'evening' || slot.id === 'night') {
      if (a.categoria === 'food') opts.push('Perfect for tonight');
      if (isSunset) opts.push('Golden hour pick');
      else if (a.categoria === 'sea') opts.push('Great after the beach');
    }
    if (slot.id === 'morning') {
      if (a.categoria === 'tours') opts.push('Great day trip');
      if (a.categoria === 'culture') opts.push('Beat the queues');
    }
    if (slot.id === 'afternoon' && a.categoria === 'sea') opts.push('Best in the afternoon');
    if (parseFloat(a.rating) >= 4.8) opts.push('Traveller favourite');
    if (a.trending) opts.push('Trending now');
    if (place && !near && a.provincia === place.province) opts.push('Worth the trip');
    opts.push('Our pick');

    for (var i = 0; i < opts.length; i++) if (!used[opts[i]]) { used[opts[i]] = true; return opts[i]; }
    return opts[0];
  }

  function contextLine(slot, place, now) {
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var hh = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    var where = place ? ' in ' + place.name : ' in Catalunya';
    return days[now.getDay()] + ', ' + hh + where + ' — here is what we would do ' + slot.label + '.';
  }

  // ---------- Arranque ----------
  function init() {
    var section = document.getElementById('ntlPicks');
    var grid = document.getElementById('picksGrid');
    var ctx = document.getElementById('picksContext');
    var btn = document.getElementById('btnSurprise');
    if (!section || !grid) return;

    var catalog = Array.isArray(window.NTL_CATALOG) ? window.NTL_CATALOG : [];
    if (!catalog.length) return; // sin datos no mostramos el bloque

    var now = new Date();
    var slot = currentSlot(now);
    var place = readZone(catalog);

    if (ctx) ctx.textContent = contextLine(slot, place, now);

    function render(jitter) {
      var ranked = catalog
        .map(function (a) { return { a: a, s: score(a, slot, place, jitter) }; })
        .sort(function (x, y) { return y.s - x.s; })
        .map(function (o) { return o.a; });

      var picks = pickDiverse(ranked, 3);
      var usedReasons = {};
      grid.innerHTML = picks.map(function (a) {
        return pickHtml(a, reasonFor(a, slot, place, usedReasons));
      }).join('');

      // CRITICO: los enlaces acaban de crearse, hay que reaplicar la atribucion
      // o se quedarian sin cmp=EST-XXXXX y perderiamos la trazabilidad.
      if (typeof window.ntlApplyAttribution === 'function') window.ntlApplyAttribution();
    }

    render(0.8); // primera carga: casi determinista, manda el contexto

    if (btn) {
      btn.addEventListener('click', function () {
        render(9); // "Surprise me": mucha mas variedad
        grid.classList.remove('ntl-pop');
        void grid.offsetWidth; // reinicia la animacion
        grid.classList.add('ntl-pop');
      });
    }

    section.hidden = false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
