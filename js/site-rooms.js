/* =========================================================
   site-rooms.js — Renders the rooms grid(s) from the shared
   data layer (Firestore -> demo seed fallback).
   Used by: homepage #roomGrid and pages/rooms.html #roomGrid.
   No UI/design change: identical card markup to the original.
   ========================================================= */
(function () {
  "use strict";

  // shared.js is always loaded before this file (verified in all HTML pages).
  var esc = MGShared.esc;

  function viewLabel(lang) {
    if (window.MGLang) return window.MGLang.t ? window.MGLang.t("view") : (lang === "ar" ? "عرض التفاصيل" : "View Details");
    return lang === "ar" ? "عرض التفاصيل" : "View Details";
  }

  function nightLabel(lang) {
    if (window.MGLang && window.MGLang.t) {
      var v = window.MGLang.t("night");
      if (v != null && v !== "night") return v;
    }
    return lang === "ar" ? "ليلة" : "night";
  }

  function cardHTML(r, lang) {
    // Normalize both live-API and demo-seed shapes; skip unusable rows.
    var room = MGShared.normalizeRoom(r);
    if (!room) return "";
    var name = lang === "ar" && room.name_ar ? room.name_ar : room.name;
    var desc = lang === "ar" && room.desc_ar ? room.desc_ar : room.description;
    var price = (room.price == null || isNaN(room.price))
      ? ""
      : (window.MGSettings && MGSettings.formatMoney
          ? MGSettings.formatMoney(room.price)
          : new Intl.NumberFormat("en-US", { style: "currency", currency: (window.MGSettings && MGSettings.getCurrency) ? MGSettings.getCurrency() : "USD", currencyDisplay: "symbol", minimumFractionDigits: 2 }).format(room.price));
    var amenities = room.amenities.map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("");
    var badge = room.type ? '<span class="badge">' + esc(room.type) + "</span>" : "";
    var inPages = window.location.pathname.replace(/\\/g, "/").includes("/pages/");
    var detailsBase = inPages ? "room-details.html" : "pages/room-details.html";
    return '<article class="card room-card reveal">' +
      '<a class="room-card__link" href="' + detailsBase + '?id=' + encodeURIComponent(room.id) + '" tabindex="-1" aria-hidden="true"></a>' +
      '<div class="media-frame room-card__media"><img src="' + esc(room.images[0] || "") + '" alt="' + esc(name) + '" loading="lazy"><span class="room-card__avail" data-avail-badge="' + esc(room.id) + '"></span></div>' +
      '<div class="room-card__body">' +
        badge +
        '<h3 class="fs-h4 room-card__name">' + esc(name) + "</h3>" +
        (desc ? '<p class="text-muted room-card__desc">' + esc(desc) + "</p>" : "") +
        (price ? '<div class="room-card__price">' + price + ' <span>' + esc(nightLabel(lang)) + "</span></div>" : "") +
        (amenities ? '<div class="room-card__amen">' + amenities + "</div>" : "") +
        '<a href="' + detailsBase + '?id=' + encodeURIComponent(room.id) + '" class="btn btn--outline btn--block room-card__cta">' + esc(viewLabel(lang)) + "</a>" +
      "</div>" +
    "</article>";
  }

  async function renderRoomsGrid(grid, opts) {
    opts = opts || {};
    const loading = document.getElementById("roomGridLoading");
    const empty = document.getElementById("roomGridEmpty");
    if (!grid) return;

    // Show loading immediately
    if (loading) loading.style.display = "";
    if (empty) empty.style.display = "none";

    let rooms = [];
    try {
      rooms = await window.MGSiteData.getList("rooms") || [];
    } catch (e) { rooms = []; }

    if (loading) loading.style.display = "none";

    // Drop unusable rows BEFORE slicing the limit so malformed data
    // never steals a card slot or renders garbage.
    rooms = (rooms || []).map(function (r) { return MGShared.normalizeRoom(r); }).filter(function (room) { return room && room.name; });

    if (!rooms.length) {
      if (empty) empty.style.display = "";
      grid.querySelectorAll(".room-card").forEach(n => n.remove());
      return;
    }

    if (opts.limit) rooms = rooms.slice(0, opts.limit);
    const lang = (window.MGLang && window.MGLang.get && window.MGLang.get()) || "en";
    grid.querySelectorAll(".room-card").forEach(n => n.remove());
    grid.insertAdjacentHTML("beforeend", rooms.map(r => cardHTML(r, lang)).join(""));
    document.dispatchEvent(new CustomEvent("rooms:rendered"));
  }

  window.renderRoomsGrid = renderRoomsGrid;

  // Auto-init on DOMready if a #roomGrid exists (homepage + rooms page).
  function init() {
    const grid = document.getElementById("roomGrid");
    if (!grid || !window.MGSiteData) return;
    renderRoomsGrid(grid, { limit: grid.dataset.limit ? +grid.dataset.limit : undefined });
    if (window.MGLang) document.addEventListener("lang:change", () => renderRoomsGrid(grid, { limit: grid.dataset.limit ? +grid.dataset.limit : undefined }));
    // Re-render when settings load (currency may have changed).
    document.addEventListener("settings:loaded", () => renderRoomsGrid(grid, { limit: grid.dataset.limit ? +grid.dataset.limit : undefined }));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
