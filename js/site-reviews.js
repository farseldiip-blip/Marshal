/* site-reviews.js — Public "Guest Voices" carousel bound to the reviews collection.
   Mirrors js/site-rooms.js / js/site-gallery.js: live Firestore via MGSiteData,
   demo fallback to window.__mgSeed, loading/empty/error states preserved.

   Public only shows reviews with status === "Published" (so the admin can hold
   Pending reviews without exposing them).

   Markup contract (existing index.html structure is preserved):
     <div class="swiper voices__swiper" id="testiSwiper">
       <div class="swiper-wrapper" id="testiWrap"></div>
       <div class="swiper-pagination voices__dots"></div>
     </div>
   The hardcoded <swiper-slide> cards are replaced by #testiWrap; the admin's
   Reviews CRUD (dashboard.js) reads/writes the same `reviews` collection.
*/
(function () {
  "use strict";

  function initials(name) {
    if (!name) return "?";
    const parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function stars(n) {
    const r = Math.max(0, Math.min(5, Number(n) || 0));
    return "★".repeat(r) + "☆".repeat(5 - r);
  }

  function escapeHTML(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function cardHTML(r) {
    const avatar = initials(r.author);
    const name = escapeHTML(r.author || "");
    const loc = escapeHTML(r.location || "");
    const text = escapeHTML(r.text || "");
    const rating = stars(r.rating);
    return `
      <div class="swiper-slide">
        <figure class="voice-card">
          <div class="voice-card__stars" aria-hidden="true">${rating}</div>
          <blockquote class="voice-card__text">${text}</blockquote>
          <figcaption class="voice-card__by">
            <span class="voice-card__avatar">${avatar}</span>
            <span class="voice-card__meta"><span class="voice-card__name">${name}</span>${loc ? `<span class="voice-card__loc text-muted">${loc}</span>` : ""}</span>
          </figcaption>
        </figure>
      </div>`;
  }

  async function render() {
    const swiper = document.getElementById("testiSwiper");
    const wrap = document.getElementById("testiWrap");
    if (!wrap) return;

    const loading = document.getElementById("testiLoading");
    const empty = document.getElementById("testiEmpty");
    const error = document.getElementById("testiError");

    if (loading) loading.hidden = false;
    if (empty) empty.hidden = true;
    if (error) error.hidden = true;

    try {
      const all = await (window.MGSiteData
        ? window.MGSiteData.getList("reviews")
        : (window.__mgSeed ? window.__mgSeed.reviews : []));
      const published = (all || []).filter(r => (r.status || "Published") === "Published");

      if (loading) loading.hidden = true;

      if (!published.length) {
        wrap.innerHTML = "";
        if (empty) empty.hidden = false;
        if (window.initTestiSwiper) window.initTestiSwiper();
        return;
      }

      wrap.innerHTML = published.map(cardHTML).join("");
      if (empty) empty.hidden = true;

      // Re-init the Swiper now that the real slides are in the DOM.
      if (window.initTestiSwiper) window.initTestiSwiper();
    } catch (e) {
      if (loading) loading.hidden = true;
      if (empty) empty.hidden = true;
      if (error) { error.hidden = false; error.textContent = "We couldn't load guest voices. Please refresh."; }
      console.error("[site-reviews] failed to load reviews:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }

  window.MGSiteReviews = { render: render };
})();
