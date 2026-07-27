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

  // ---------- Detalle de un plan ----------
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

  // La navegacion hacia atras vive en la cabecera (ntlSetBack), no aqui.
  function detailHtml(pl) {
    return '' +
      '<h2 class="ntl-pv-title">' + esc(pl.titulo) + '</h2>' +
      '<p class="ntl-pv-sub">' + esc(pl.subtitulo) + '</p>' +
      '<p class="ntl-pv-meta">' + esc(pl.duracion) + ' &middot; ' + pl.pasos.length +
        ' stops &middot; from ' + pl.desde + '&euro;</p>' +
      '<div class="ntl-pv-steps">' + pl.pasos.map(stepHtml).join('') + '</div>';
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
      detail.hidden = true;
      detail.innerHTML = '';
      grid.hidden = false;
      if (intro) intro.hidden = false;
      // La flecha de la cabecera vuelve a llevar al catalogo.
      if (typeof window.ntlSetBack === 'function') window.ntlSetBack('plans');
    }

    function showDetail(id) {
      var pl = byId[id];
      if (!pl) return;
      detail.innerHTML = detailHtml(pl);
      grid.hidden = true;
      if (intro) intro.hidden = true;
      detail.hidden = false;

      // CRITICO: los enlaces de los pasos acaban de crearse.
      if (typeof window.ntlApplyAttribution === 'function') window.ntlApplyAttribution();

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
