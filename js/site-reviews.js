/* site-reviews.js — Public "Guest Voices" carousel bound to the reviews collection.
   Mirrors js/site-rooms.js / js/site-gallery.js: live data via MGSiteData,
   demo fallback to window.__mgSeed, loading/empty/error states preserved.

   Public only shows reviews with status === "Published" (server-side filtered).

   Markup contract (existing index.html structure is preserved):
     <div class="swiper voices__swiper" id="testiSwiper">
       <div class="swiper-wrapper" id="testiWrap"></div>
       <div class="swiper-pagination voices__dots"></div>
     </div>
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

  // shared.js is always loaded before this file (verified in all HTML pages).
  var esc = MGShared.esc;

  function cardHTML(r) {
    const avatar = initials(r.author);
    const name = esc(r.author || "");
    const text = esc(r.text || r.comment || "");
    const rating = stars(r.rating);
    return `
      <div class="swiper-slide">
        <figure class="voice-card">
          <div class="voice-card__stars" aria-hidden="true">${rating}</div>
          <blockquote class="voice-card__text">${text}</blockquote>
          <figcaption class="voice-card__by">
            <span class="voice-card__avatar">${avatar}</span>
            <span class="voice-card__meta"><span class="voice-card__name">${name}</span></span>
          </figcaption>
        </figure>
      </div>`;
  }

  function emptyStateHTML() {
    const isAR = document.documentElement.lang === "ar";
    return `
      <div style="text-align:center;padding:3rem 1rem;color:var(--muted,var(--text-muted,#8A93A6))">
        <div style="font-size:2.5rem;margin-bottom:1rem;opacity:0.5">★</div>
        <p style="font-family:var(--font-head);font-size:1.1rem;margin-bottom:0.5rem;color:var(--text)">
          ${isAR ? "لا توجد تقييمات بعد" : "No guest voices yet"}
        </p>
        <p style="font-size:0.85rem">
          ${isAR ? "كن أول من يشارك تجربته" : "Be the first to share your experience"}
        </p>
      </div>`;
  }

  async function render() {
    const wrap = document.getElementById("testiWrap");
    if (!wrap) return;

    const loading = document.getElementById("testiLoading");
    const empty = document.getElementById("testiEmpty");
    const error = document.getElementById("testiError");
    const section = document.getElementById("testimonials");

    if (loading) loading.hidden = false;
    if (empty) empty.hidden = true;
    if (error) error.hidden = true;

    try {
      const all = await (window.MGSiteData
        ? window.MGSiteData.getList("reviews")
        : (window.__mgSeed ? window.__mgSeed().reviews : []));
      const published = (all || []).filter(r => {
        const s = (r.status || "").toUpperCase();
        return s === "PUBLISHED" || s === "Published" || (!r.status && r.approved === true);
      });

      if (loading) loading.hidden = true;

      if (!published.length) {
        wrap.innerHTML = "";
        // Show premium empty state inside the swiper wrapper
        if (section) {
          const swiperEl = section.querySelector(".voices__swiper");
          if (swiperEl) {
            const existingEmpty = swiperEl.querySelector(".voices-empty-state");
            if (!existingEmpty) {
              const div = document.createElement("div");
              div.className = "voices-empty-state";
              div.innerHTML = emptyStateHTML();
              swiperEl.appendChild(div);
            }
          }
        }
        // Hide nav arrows and dots for empty state
        const prevBtn = document.getElementById("testiPrev");
        const nextBtn = document.getElementById("testiNext");
        if (prevBtn) prevBtn.style.display = "none";
        if (nextBtn) nextBtn.style.display = "none";
        if (window.initTestiSwiper) window.initTestiSwiper();
        return;
      }

      // Remove any empty state placeholder
      if (section) {
        const emptyState = section.querySelector(".voices-empty-state");
        if (emptyState) emptyState.remove();
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
