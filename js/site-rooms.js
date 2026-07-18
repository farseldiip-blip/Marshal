/* =========================================================
   site-rooms.js — Renders the rooms grid(s) from the shared
   data layer (Firestore -> demo seed fallback).
   Used by: homepage #roomGrid and pages/rooms.html #roomGrid.
   No UI/design change: identical card markup to the original.
   ========================================================= */
(function () {
  "use strict";

  function viewLabel(lang) {
    if (window.MGLang) return window.MGLang.t ? window.MGLang.t("view") : (lang === "ar" ? "عرض التفاصيل" : "View Details");
    return lang === "ar" ? "عرض التفاصيل" : "View Details";
  }

  function cardHTML(r, lang) {
    const name = lang === "ar" && r.name_ar ? r.name_ar : (r.name || "");
    const desc = lang === "ar" && r.desc_ar ? r.desc_ar : (r.desc || "");
    const price = typeof r.price === "number" ? "$" + r.price.toLocaleString() : (r.price || "");
    const amenities = (r.amenities || []).map(x => `<span>${x}</span>`).join("");
    return `<article class="card room-card reveal">
      <div class="media-frame room-card__media"><img src="${r.image || ""}" alt="${name}" loading="lazy"></div>
      <div class="room-card__body">
        <span class="badge">${r.type || ""}</span>
        <h3 class="fs-h4">${name}</h3>
        <p class="text-muted">${desc}</p>
        <div class="room-card__price">${price} <span>/ night</span></div>
        <div class="room-card__amen">${amenities}</div>
        <a href="pages/room-details.html" class="btn btn--outline btn--block mt-2">${viewLabel(lang)}</a>
      </div>
    </article>`;
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

    if (!rooms.length) {
      if (empty) empty.style.display = "";
      grid.querySelectorAll(".room-card").forEach(n => n.remove());
      return;
    }

    if (opts.limit) rooms = rooms.slice(0, opts.limit);
    const lang = (window.MGLang && window.MGLang.get && window.MGLang.get()) || "en";
    grid.querySelectorAll(".room-card").forEach(n => n.remove());
    grid.insertAdjacentHTML("beforeend", rooms.map(r => cardHTML(r, lang)).join(""));
  }

  window.renderRoomsGrid = renderRoomsGrid;

  // Auto-init on DOMready if a #roomGrid exists (homepage + rooms page).
  function init() {
    const grid = document.getElementById("roomGrid");
    if (!grid || !window.MGSiteData) return;
    renderRoomsGrid(grid, { limit: grid.dataset.limit ? +grid.dataset.limit : undefined });
    if (window.MGLang) document.addEventListener("lang:change", () => renderRoomsGrid(grid, { limit: grid.dataset.limit ? +grid.dataset.limit : undefined }));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
