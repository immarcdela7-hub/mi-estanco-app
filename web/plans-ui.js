/* NoTaxLost — Planes curados ("Ready-made plans").
   Pinta los planes de window.NTL_PLANS (generado desde plans.csv). Cada plan se
   abre en acordeon y muestra sus actividades en orden con nuestra nota.

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

  // Franja horaria actual, para ordenar los planes por lo que encaja ahora.
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
    return plans.slice().sort(function (a, b) {
      var sa = 0, sb = 0;
      if (zone && norm(a.city) === zone) sa += 4; else if (provOfZone && a.provincia === provOfZone) sa += 2;
      if (zone && norm(b.city) === zone) sb += 4; else if (provOfZone && b.provincia === provOfZone) sb += 2;
      if (a.momento.indexOf(slot) !== -1) sa += 1;
      if (b.momento.indexOf(slot) !== -1) sb += 1;
      return sb - sa;
    });
  }

  var STAR = '<svg style="display:inline-block;width:.7rem;height:.7rem;margin-top:-2px;color:#facc15" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.363 1.118l1.287 3.958c.3.921-.771 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.175 0l-3.37 2.448c-.768.57-1.838-.197-1.539-1.118l1.286-3.958a1 1 0 00-.362-1.118L2.02 9.383c-.784-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.286-3.958z"/></svg>';

  function stepHtml(p, i) {
    return '' +
      '<a class="ntl-step" href="' + esc(p.url) + '">' +
        '<div class="ntl-step-n">' + (i + 1) + '</div>' +
        '<div class="ntl-step-img"><img src="' + esc(p.imagen) + '" alt="' + esc(p.titulo) + '" loading="lazy"></div>' +
        '<div class="ntl-step-body">' +
          '<h4 class="ntl-step-title">' + esc(p.titulo) + '</h4>' +
          (p.nota ? '<p class="ntl-step-note">' + esc(p.nota) + '</p>' : '') +
          '<div class="ntl-step-meta">' +
            (p.rating ? '<b>' + STAR + ' ' + esc(p.rating) + '</b>' : '') +
            '<b>' + esc(p.precioDisplay) + '</b>' +
          '</div>' +
        '</div>' +
        '<span class="ntl-step-book">Book</span>' +
      '</a>';
  }

  function planHtml(pl) {
    return '' +
      '<article class="ntl-plan" data-plan="' + esc(pl.id) + '">' +
        '<button class="ntl-plan-head" type="button" aria-expanded="false">' +
          '<span class="ntl-plan-info">' +
            '<span class="ntl-plan-title">' + esc(pl.titulo) + '</span>' +
            '<span class="ntl-plan-sub">' + esc(pl.subtitulo) + '</span>' +
            '<span class="ntl-plan-meta">' + esc(pl.duracion) + ' &middot; ' +
              pl.pasos.length + ' stops &middot; from ' + pl.desde + '&euro;</span>' +
          '</span>' +
          '<span class="ntl-plan-chevron" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>' +
          '</span>' +
        '</button>' +
        '<div class="ntl-plan-body" hidden>' + pl.pasos.map(stepHtml).join('') + '</div>' +
      '</article>';
  }

  function init() {
    // Igual que recommend.js: aqui solo se pinta; la barra que lo contiene la
    // muestra el controlador de tickets.html.
    var list = document.getElementById('plansList');
    if (!list) return;

    var plans = Array.isArray(window.NTL_PLANS) ? window.NTL_PLANS : [];
    if (!plans.length) return; // sin planes, el bloque no aparece

    var catalog = Array.isArray(window.NTL_CATALOG) ? window.NTL_CATALOG : [];
    var ordered = rank(plans, zoneFromUrl(), slotNow(new Date()), catalog);

    list.innerHTML = ordered.map(planHtml).join('');

    // CRITICO: los enlaces de los pasos acaban de crearse.
    if (typeof window.ntlApplyAttribution === 'function') window.ntlApplyAttribution();

    // Acordeon: solo un plan abierto a la vez.
    list.addEventListener('click', function (ev) {
      var head = ev.target.closest ? ev.target.closest('.ntl-plan-head') : null;
      if (!head || !list.contains(head)) return;
      var art = head.parentNode;
      var open = head.getAttribute('aria-expanded') === 'true';
      list.querySelectorAll('.ntl-plan-head').forEach(function (h) {
        h.setAttribute('aria-expanded', 'false');
        h.parentNode.classList.remove('is-open');
        h.parentNode.querySelector('.ntl-plan-body').hidden = true;
      });
      if (!open) {
        head.setAttribute('aria-expanded', 'true');
        art.classList.add('is-open');
        art.querySelector('.ntl-plan-body').hidden = false;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
