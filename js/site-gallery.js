/* =========================================================
   site-gallery.js — Renders gallery grids from the shared
   data layer (Firestore -> demo seed fallback).
   Used by: homepage #masonry and pages/gallery.html #masonryFull.
   No UI/design change: identical .g-item / lightbox markup.
   ========================================================= */
(function () {
  "use strict";

  // Derive a sized URL from the stored full URL (mirrors original behavior:
  // thumbnails at w=600, lightbox at w=1200).
  function sized(url, w) {
    if (!url) return "";
    try {
      const u = new URL(url);
      u.searchParams.set("w", w);
      u.searchParams.set("auto", "format");
      u.searchParams.set("fit", "crop");
      u.searchParams.set("q", "80");
      return u.toString();
    } catch (e) {
      // Non-URL fallback: just swap the w param if present.
      return url.replace(/([?&])w=\d+/, "$1w=" + w);
    }
  }

  function itemHTML(g) {
    const full = sized(g.url, 1200);
    const thumb = sized(g.url, 600);
    return `<a class="g-item reveal" href="${full}" data-lightbox><img src="${thumb}" alt="${(g.title || "Gallery").replace(/"/g, "&quot;")}" loading="lazy"></a>`;
  }

  async function renderGallery(grid) {
    if (!grid || !window.MGSiteData) return;
    const loading = grid.parentElement ? grid.parentElement.querySelector(".dash-loading") : null;
    const empty = grid.parentElement ? grid.parentElement.querySelector(".gallery-empty") : null;
    if (loading) loading.style.display = "";

    let items = [];
    try { items = await window.MGSiteData.getList("gallery") || []; }
    catch (e) { items = []; }

    if (loading) loading.style.display = "none";
    grid.querySelectorAll(".g-item").forEach(n => n.remove());

    if (!items.length) {
      if (empty) empty.style.display = "";
      return;
    }
    if (empty) empty.style.display = "none";
    grid.insertAdjacentHTML("beforeend", items.map(itemHTML).join(""));
    // Lightbox is handled by the delegated [data-lightbox] listener in
    // booking.js, which automatically covers these injected items.
  }

  window.renderGallery = renderGallery;

  function init() {
    document.querySelectorAll(".masonry[id]").forEach(grid => renderGallery(grid));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
