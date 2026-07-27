/* NoTaxLost — Actividades propias y su reserva.

   Esto es lo que las de GetYourGuide no pueden hacer: sus widgets no dejan
   cobrar fuera de su dominio, asi que el cliente siempre acaba en su web. Las
   actividades de aqui son nuestras, y la reserva entera —dia, hora, personas,
   precio y confirmacion— ocurre en notaxlost.com. Al otro lado esta el CRM
   (/api/publico/…), que es quien manda sobre el cupo y el precio.

   El reservador va en dos pasos (cuando -> quien) en vez de un formulario
   largo: quien entra solo quiere saber si hay sitio el sabado, no rellenar
   sus datos todavia.

   La atribucion del QR viaja en el cuerpo de la reserva (`ref`), no en un
   enlace: aqui no hay enlace externo al que colgarle cmp. */
(function () {
  'use strict';

  var CRM = String(window.NTL_CRM || 'https://crm.notaxlost.com').replace(/\/+$/, '');

  var esc = function (v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  function ref() {
    var r = new URLSearchParams(location.search).get('ref');
    if (r) return r;
    var m = document.cookie.match(/(?:^|; )ntl_ref=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function eur(n) {
    return (Math.round(n * 100) / 100).toLocaleString('en-GB', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2,
    });
  }

  function duracion(min) {
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60), m = min % 60;
    return m ? h + ' h ' + m + ' min' : h + (h === 1 ? ' hour' : ' hours');
  }

  var MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /** "2026-08-14" -> {dow:"Thu", d:"14", m:"Aug"}. Se lee en UTC a proposito:
      la fecha es un dia del calendario, no un instante. */
  function partes(iso) {
    var d = new Date(iso + 'T12:00:00Z');
    return { dow: DIAS[d.getUTCDay()], d: String(d.getUTCDate()), m: MESES[d.getUTCMonth()] };
  }

  function fechaLarga(iso) {
    var p = partes(iso);
    return p.dow + ' ' + p.d + ' ' + p.m;
  }

  var ICONO_RELOJ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M12 7v5l3 2"/></svg>';
  var ICONO_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/>' +
    '<circle cx="12" cy="10" r="2.5"/></svg>';

  // ---------------------------------------------------------------- tarjetas

  var CAT_LABEL = {
    culture: 'Culture', gastro: 'Food & wine', sea: 'Sea', nature: 'Nature',
    nightlife: 'Nightlife', family: 'Family',
  };

  /* Misma estructura que las tarjetas del catalogo (mismas clases y data-*),
     para que los filtros, el orden y las dos vistas funcionen igual. Lo que
     cambia es el distintivo y el pie: hay que dejar claro quien vende.
     El boton NO lleva la clase .ntl-card-dates: esa la escucha el catalogo
     para abrir el widget de GetYourGuide, y se abririan los dos a la vez. */
  function cardHtml(a) {
    var precio = eur(a.precio);
    return '' +
      '<div class="experience-item ntl-own group bg-white rounded-2xl shadow-sm hover:shadow-xl transition border border-gray-100 overflow-hidden"' +
      ' data-province="' + esc(a.provincia) + '" data-city="' + esc(a.city) + '"' +
      ' data-category="' + esc(a.categoria) + '" data-name="' + esc(a.titulo + ' ' + a.city + ' ' + a.resumen) + '"' +
      ' data-price="' + esc(a.precio) + '" data-rating="4.9" data-order="0" data-own="' + esc(a.slug) + '">' +
      '<a href="?actividad=' + encodeURIComponent(a.slug) + '" class="item-link" data-own-open="' + esc(a.slug) + '">' +
      '<div class="item-wrapper flex">' +
      '<div class="item-image relative overflow-hidden shrink-0">' +
      (a.imagen
        ? '<img src="' + esc(a.imagen) + '" alt="' + esc(a.titulo) + '" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">'
        : '<div class="ntl-own-nopic"></div>') +
      '<div class="ntl-own-flag">Book here</div>' +
      '</div>' +
      '<div class="item-content">' +
      '<div class="text-content">' +
      '<div class="category-tag text-[10px] font-bold text-ntl-accent uppercase tracking-wider mb-1">' +
      esc(CAT_LABEL[a.categoria] || a.categoria) + '</div>' +
      '<h3 class="font-bold text-gray-900 mb-1 leading-tight line-clamp-2">' + esc(a.titulo) + '</h3>' +
      '<p class="item-description text-xs text-gray-500 mb-2 line-clamp-2">' + esc(a.resumen) + '</p>' +
      '</div>' +
      '<div class="item-footer pt-3 border-t border-gray-50 flex items-center justify-between w-full">' +
      '<span class="footer-tag text-xs font-bold text-gray-400">' +
      esc(a.city || 'Catalunya') + '</span>' +
      '<div class="flex items-center">' +
      '<span class="price-tag text-sm font-bold text-gray-900 mr-3 hidden sm:block">' + esc(precio) + '</span>' +
      '<span class="book-btn bg-ntl-navy text-white text-xs font-bold px-4 py-2 rounded-full group-hover:bg-ntl-vibrant transition shadow-sm text-center">Book</span>' +
      '</div></div></div></div></a>' +
      '<button type="button" class="ntl-own-dates" data-own-open="' + esc(a.slug) + '">' +
      'Choose a date &amp; book here</button>' +
      '</div>';
  }

  // ------------------------------------------------------------------ modal

  var modal, cuerpo;
  var estado = null; // { act, dias, fecha, hora, personas, paso }

  function crearModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'ntl-modal ntl-bk';
    modal.id = 'ownModal';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="ntl-modal-backdrop" data-close></div>' +
      '<div class="ntl-modal-box" role="dialog" aria-modal="true" aria-labelledby="ownModalTitle">' +
      '<div id="ownModalBody"></div></div>';
    document.body.appendChild(modal);
    cuerpo = modal.querySelector('#ownModalBody');

    modal.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-close]')) cerrar();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && modal && !modal.hidden) cerrar();
    });
    conectarModal();
  }

  function cerrar() {
    if (!modal) return;
    modal.hidden = true;
    cuerpo.innerHTML = '';
    estado = null;
    document.body.style.overflow = '';
    // Se quita ?actividad= para no dejar la URL apuntando a un modal cerrado.
    var u = new URL(location.href);
    if (u.searchParams.has('actividad')) {
      u.searchParams.delete('actividad');
      history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    }
  }

  function cerrarBoton() {
    return '<button type="button" class="ntl-bk-x" data-close aria-label="Close">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg></button>';
  }

  function abrir(slug) {
    crearModal();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    cuerpo.innerHTML = cerrarBoton() +
      '<div class="ntl-bk-cargando"><span class="ntl-bk-spin"></span>Checking availability…</div>';

    fetch(CRM + '/api/publico/disponibilidad?slug=' + encodeURIComponent(slug))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (act) {
        var dias = act.dias || [];
        estado = {
          act: act,
          dias: dias,
          fecha: dias[0] ? dias[0].date : '',
          // La primera hora libre viene marcada: quien abre esto quiere ver un
          // precio y un boton que funcione, no otra decision en blanco.
          hora: dias[0] && dias[0].slots[0] ? dias[0].slots[0].time : '',
          personas: Math.max(1, act.min_personas || 1),
          paso: 1,
        };
        pintar();
      })
      .catch(function () {
        cuerpo.innerHTML = cerrarBoton() +
          '<div class="ntl-bk-vacio"><h4>We could not load the availability</h4>' +
          '<p>Please try again in a moment.</p></div>';
      });
  }

  function diaActual() {
    if (!estado) return null;
    for (var i = 0; i < estado.dias.length; i++) {
      if (estado.dias[i].date === estado.fecha) return estado.dias[i];
    }
    return null;
  }

  function huecoActual() {
    var d = diaActual();
    if (!d || !estado.hora) return null;
    for (var i = 0; i < d.slots.length; i++) if (d.slots[i].time === estado.hora) return d.slots[i];
    return null;
  }

  function topePersonas() {
    var h = huecoActual();
    return h ? h.free : estado.act.max_personas;
  }

  function total() {
    return estado.act.precio * estado.personas;
  }

  // --------------------------------------------------------------- pintado

  function heroHtml() {
    var act = estado.act;
    return '<header class="ntl-bk-hero' + (act.imagen ? '' : ' ntl-bk-hero-liso') + '">' +
      (act.imagen ? '<img src="' + esc(act.imagen) + '" alt="">' : '') +
      '<div class="ntl-bk-hero-velo"></div>' +
      cerrarBoton() +
      '<div class="ntl-bk-hero-txt">' +
      '<span class="ntl-bk-sello">Booked with NoTaxLost</span>' +
      '<h3 id="ownModalTitle">' + esc(act.titulo) + '</h3>' +
      '</div></header>';
  }

  function metaHtml() {
    var act = estado.act;
    return '<div class="ntl-bk-meta">' +
      '<span class="ntl-bk-precio">' + esc(eur(act.precio)) + '<small>per person</small></span>' +
      '<span class="ntl-bk-meta-i">' + ICONO_RELOJ + duracion(act.duracion_min) + '</span>' +
      (act.punto_encuentro
        ? '<span class="ntl-bk-meta-i">' + ICONO_PIN + esc(act.punto_encuentro) + '</span>' : '') +
      '</div>';
  }

  function pasosHtml() {
    var p = estado.paso;
    return '<ol class="ntl-bk-pasos">' +
      '<li class="' + (p > 1 ? 'is-hecho' : 'is-ahora') + '"><span>1</span>Date &amp; time</li>' +
      '<li class="' + (p === 2 ? 'is-ahora' : '') + '"><span>2</span>Your details</li>' +
      '</ol>';
  }

  function paso1Html() {
    var dia = diaActual();
    var tope = topePersonas();
    var min = Math.max(1, estado.act.min_personas || 1);

    return '<section class="ntl-bk-panel">' +
      '<div class="ntl-bk-rot">Pick a date</div>' +
      '<div class="ntl-bk-calendario">' +
      '<button type="button" class="ntl-bk-flecha" data-scroll="-1" aria-label="Earlier dates">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M15 6l-6 6 6 6"/></svg></button>' +
      '<div class="ntl-bk-days">' +
      estado.dias.map(function (d) {
        var p = partes(d.date);
        return '<button type="button" class="ntl-bk-day' + (d.date === estado.fecha ? ' is-on' : '') +
          '" data-fecha="' + esc(d.date) + '">' +
          '<span class="ntl-bk-dow">' + p.dow + '</span>' +
          '<span class="ntl-bk-dnum">' + p.d + '</span>' +
          '<span class="ntl-bk-dmon">' + p.m + '</span></button>';
      }).join('') +
      '</div>' +
      '<button type="button" class="ntl-bk-flecha" data-scroll="1" aria-label="Later dates">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6-6 6"/></svg></button>' +
      '</div>' +

      '<div class="ntl-bk-rot">Start time</div>' +
      '<div class="ntl-bk-slots">' +
      (dia ? dia.slots.map(function (s) {
        return '<button type="button" class="ntl-bk-slot' + (s.time === estado.hora ? ' is-on' : '') +
          '" data-hora="' + esc(s.time) + '">' + esc(s.time) +
          '<small>' + s.free + ' left</small></button>';
      }).join('') : '') +
      '</div>' +

      '<div class="ntl-bk-rot">How many of you?</div>' +
      '<div class="ntl-bk-personas">' +
      '<button type="button" class="ntl-bk-pm" data-people="-1"' +
      (estado.personas <= min ? ' disabled' : '') + ' aria-label="One less">&minus;</button>' +
      '<span class="ntl-bk-n">' + estado.personas + '</span>' +
      '<button type="button" class="ntl-bk-pm" data-people="1"' +
      (estado.personas >= tope ? ' disabled' : '') + ' aria-label="One more">+</button>' +
      '</div>' +
      (min > 1 ? '<p class="ntl-bk-pista">This experience runs from ' + min + ' people.</p>' : '') +
      '</section>' +

      '<footer class="ntl-bk-pie">' +
      '<div class="ntl-bk-total"><span>Total</span><b>' + esc(eur(total())) + '</b></div>' +
      '<button type="button" class="ntl-bk-go" data-continuar' + (estado.hora ? '' : ' disabled') + '>' +
      (estado.hora ? 'Continue' : 'Pick a start time') + '</button>' +
      '</footer>';
  }

  function paso2Html() {
    return '<section class="ntl-bk-panel">' +
      '<div class="ntl-bk-elegido">' +
      '<div><b>' + esc(fechaLarga(estado.fecha)) + ' · ' + esc(estado.hora) + '</b>' +
      '<span>' + estado.personas + (estado.personas === 1 ? ' person' : ' people') +
      ' · ' + esc(eur(total())) + '</span></div>' +
      '<button type="button" class="ntl-bk-cambiar" data-volver>Change</button>' +
      '</div>' +

      '<form class="ntl-bk-form" novalidate>' +
      '<label class="ntl-bk-field"><span>Your name</span>' +
      '<input name="nombre" required autocomplete="name" placeholder="Marc Delgado"></label>' +
      '<label class="ntl-bk-field"><span>Email</span>' +
      '<input name="email" type="email" required autocomplete="email" placeholder="you@email.com"></label>' +
      '<label class="ntl-bk-field"><span>Phone <i>optional</i></span>' +
      '<input name="telefono" autocomplete="tel" placeholder="+34 600 000 000"></label>' +
      '<label class="ntl-bk-field"><span>Anything we should know? <i>optional</i></span>' +
      '<input name="notas" maxlength="500" placeholder="Allergies, celebrating something…"></label>' +
      '<input type="text" name="web" class="ntl-bk-trap" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<button type="submit" class="ntl-bk-go">Confirm booking · ' + esc(eur(total())) + '</button>' +
      '<p class="ntl-bk-legal">No payment now. We confirm by email and you pay at the meeting point.</p>' +
      '</form></section>';
  }

  function pintar() {
    if (!estado.dias.length) {
      cuerpo.innerHTML = heroHtml() +
        '<div class="ntl-bk-vacio"><h4>No dates open right now</h4>' +
        '<p>Write to us and we will find one for you.</p></div>';
      return;
    }
    var tope = topePersonas();
    if (estado.personas > tope) estado.personas = tope;

    cuerpo.innerHTML = heroHtml() + metaHtml() + pasosHtml() +
      (estado.paso === 1 ? paso1Html() : paso2Html());

    if (estado.paso === 1) centrarDia();
    else {
      var primero = cuerpo.querySelector('.ntl-bk-field input');
      if (primero) primero.focus();
    }
  }

  /** El dia elegido siempre a la vista, aunque este a dos semanas vista. */
  function centrarDia() {
    var tira = cuerpo.querySelector('.ntl-bk-days');
    var activo = tira && tira.querySelector('.ntl-bk-day.is-on');
    if (!tira || !activo) return;
    tira.scrollLeft = activo.offsetLeft - (tira.clientWidth - activo.offsetWidth) / 2;
  }

  // --------------------------------------------------------------- enviar

  function enviar(form) {
    var boton = form.querySelector('.ntl-bk-go');
    var previo = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Sending…';
    var viejo = form.querySelector('.ntl-bk-error');
    if (viejo) viejo.remove();

    var datos = {
      slug: estado.act.slug,
      fecha: estado.fecha,
      hora: estado.hora,
      personas: estado.personas,
      nombre: form.nombre.value.trim(),
      email: form.email.value.trim(),
      telefono: form.telefono.value.trim(),
      notas: form.notas.value.trim(),
      ref: ref(),
      idioma: 'en',
      web: form.web.value,
    };

    fetch(CRM + '/api/publico/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j && res.j.error ? res.j.error : 'We could not save your booking.');
        confirmado(res.j);
      })
      .catch(function (e) {
        boton.disabled = false;
        boton.textContent = previo;
        var p = document.createElement('p');
        p.className = 'ntl-bk-error';
        p.textContent = e.message || 'Something went wrong. Please try again.';
        form.insertBefore(p, boton);
      });
  }

  function confirmado(r) {
    cuerpo.innerHTML = heroHtml() +
      '<div class="ntl-bk-done">' +
      '<div class="ntl-bk-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg></div>' +
      '<h4>You are booked</h4>' +
      '<p class="ntl-bk-refn">' + esc(r.referencia) + '</p>' +
      '<dl class="ntl-bk-recap">' +
      '<div><dt>When</dt><dd>' + esc(fechaLarga(r.fecha)) + ' at ' + esc(r.hora) + '</dd></div>' +
      '<div><dt>People</dt><dd>' + esc(r.personas) + '</dd></div>' +
      '<div><dt>Total</dt><dd>' + esc(eur(r.total)) + '</dd></div>' +
      (r.punto_encuentro ? '<div><dt>Meeting point</dt><dd>' + esc(r.punto_encuentro) + '</dd></div>' : '') +
      '</dl>' +
      '<p class="ntl-bk-legal">We will email you the confirmation. Keep the reference handy.</p>' +
      '<button type="button" class="ntl-bk-go" data-close>Done</button>' +
      '</div>';
  }

  // Un solo oyente para todo el modal: es contenido que se repinta entero.
  function conectarModal() {
    modal.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t.closest || !estado) return;

      var flecha = t.closest('[data-scroll]');
      if (flecha) {
        var tira = cuerpo.querySelector('.ntl-bk-days');
        if (tira) tira.scrollBy({ left: parseInt(flecha.dataset.scroll, 10) * 240, behavior: 'smooth' });
        return;
      }
      var dia = t.closest('[data-fecha]');
      if (dia) {
        estado.fecha = dia.dataset.fecha;
        var d = diaActual();
        estado.hora = d && d.slots[0] ? d.slots[0].time : '';
        pintar();
        return;
      }
      var hora = t.closest('[data-hora]');
      if (hora) {
        estado.hora = hora.dataset.hora;
        pintar();
        return;
      }
      var pm = t.closest('[data-people]');
      if (pm) {
        var min = Math.max(1, estado.act.min_personas || 1);
        estado.personas = Math.min(topePersonas(),
          Math.max(min, estado.personas + parseInt(pm.dataset.people, 10)));
        pintar();
        return;
      }
      if (t.closest('[data-continuar]')) { estado.paso = 2; pintar(); return; }
      if (t.closest('[data-volver]')) { estado.paso = 1; pintar(); }
    });

    modal.addEventListener('submit', function (ev) {
      var form = ev.target.closest('.ntl-bk-form');
      if (!form) return;
      ev.preventDefault();
      if (!form.nombre.value.trim()) { form.nombre.focus(); return; }
      if (!form.email.value.trim()) { form.email.focus(); return; }
      enviar(form);
    });
  }

  // ------------------------------------------------------------------ arranque

  function montar(actividades) {
    if (!actividades.length) return;
    var container = document.getElementById('experiencesContainer');
    if (!container) return;

    container.insertAdjacentHTML('afterbegin', actividades.map(cardHtml).join(''));

    var nuevas = Array.prototype.slice.call(container.querySelectorAll('.experience-item.ntl-own'));
    if (typeof window.ntlAddItems === 'function') window.ntlAddItems(nuevas);

    crearModal();

    document.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-own-open]') : null;
      if (!t) return;
      ev.preventDefault();
      abrir(t.dataset.ownOpen);
    });

    // Enlace directo: /tickets?actividad=cata-vinos-penedes abre su reserva.
    var pedida = new URLSearchParams(location.search).get('actividad');
    if (pedida && actividades.some(function (a) { return a.slug === pedida; })) abrir(pedida);
  }

  function arrancar() {
    fetch(CRM + '/api/publico/actividades')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (d) { montar((d && d.actividades) || []); })
      .catch(function () {
        // Sin CRM la web sigue entera: solo faltan nuestras actividades.
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
