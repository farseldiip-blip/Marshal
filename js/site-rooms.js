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
    var badge = room.type ? '<span class="badge room-card__type">' + esc(room.type) + "</span>" : "";
    var inPages = window.location.pathname.replace(/\\/g, "/").includes("/pages/");
    var detailsBase = inPages ? "room-details.html" : "pages/room-details.html";
    return '<article class="card room-card reveal">' +
      '<a class="room-card__link" href="' + detailsBase + '?id=' + encodeURIComponent(room.id) + '" tabindex="-1" aria-hidden="true"></a>' +
      '<div class="media-frame room-card__media"><img src="' + esc(room.images[0] || "") + '" alt="' + esc(name) + '" loading="lazy"><span class="room-card__avail" data-avail-badge="' + esc(room.id) + '"></span></div>' +
      '<div class="room-card__body">' +
        badge +
        '<h3 class="fs-h4 room-card__name">' + esc(name) + "</h3>" +
        (desc ? '<p class="text-muted room-card__desc">' + esc(desc) + "</p>" : "") +
        (price ? '<div class="room-card__price"><span class="room-card__price-value" dir="ltr">' + price + '</span> <span class="room-card__pernight">' + esc(nightLabel(lang)) + "</span></div>" : "") +
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
      initPreviewCarousel(grid);
      return;
    }

    if (opts.limit) rooms = rooms.slice(0, opts.limit);
    const lang = (window.MGLang && window.MGLang.get && window.MGLang.get()) || "en";
    grid.querySelectorAll(".room-card").forEach(n => n.remove());
    grid.insertAdjacentHTML("beforeend", rooms.map(r => cardHTML(r, lang)).join(""));
    initPreviewCarousel(grid);
    document.dispatchEvent(new CustomEvent("rooms:rendered"));
  }

  /* ------------------------------------------------------------------
     Homepage rooms carousel (phones only, scoped to .rooms-preview).
     Pure enhancement over the shared grid: adds scroll-snap semantics,
     pagination dots, keyboard stepping, and RTL-aware active tracking.
     No data changes, no extra requests.
     ------------------------------------------------------------------ */
  function carouselReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function carouselDotLabel(n, total) {
    if (window.MGLang && window.MGLang.t) {
      const s = window.MGLang.t("rooms_carousel_dot");
      if (s && s !== "rooms_carousel_dot") return s.replace("{{n}}", n).replace("{{m}}", total);
    }
    return "Go to residence " + n + " of " + total;
  }

  function carouselActiveIndex(grid) {
    const dir = grid.getAttribute("dir") || getComputedStyle(grid).direction || "ltr";
    const cards = grid.querySelectorAll(".room-card");
    if (!cards.length) return 0;
    const gRect = grid.getBoundingClientRect();
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      const edge = dir === "rtl" ? r.right : r.left;
      const gEdge = dir === "rtl" ? gRect.right : gRect.left;
      const dist = Math.abs(edge - gEdge);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  }

  function carouselGoTo(grid, index) {
    const cards = grid.querySelectorAll(".room-card");
    if (!cards.length || index < 0 || index >= cards.length) return;
    const card = cards[index];
    // Compute the target scroll position directly (direction-aware) instead
    // of relying on scrollIntoView, which is flaky for RTL + smooth in some
    // engines. scroll-snap then settles on the exact card boundary.
    const dir = grid.getAttribute("dir") || getComputedStyle(grid).direction || "ltr";
    const gRect = grid.getBoundingClientRect();
    const cRect = card.getBoundingClientRect();
    const pad = 6; // matches scroll-padding-inline in CSS
    // Content-space coordinate of the card's inline-start edge minus padding.
    // LTR:  cardLeft - gridLeft + scrollLeft  (align card left to pad)
    // RTL:  cardRight - gridRight + scrollLeft (align card right to -pad)
    let target;
    if (dir === "rtl") target = grid.scrollLeft + (cRect.right - gRect.right) + pad;
    else target = grid.scrollLeft + (cRect.left - gRect.left) - pad;
    try {
      grid.scrollTo({ left: target, behavior: carouselReducedMotion() ? "auto" : "smooth" });
    } catch (e) {
      grid.scrollLeft = target;
    }
  }

  function initPreviewCarousel(grid) {
    if (!grid || !grid.classList || !grid.classList.contains("rooms-preview")) return;
    const dots = document.getElementById("roomGridDots");
    if (!dots) return;

    // Carousel behavior is phones-only. On desktop/tablet the grid keeps
    // its normal layout and the dots stay hidden (nothing carousel-ish).
    const isCarousel = window.matchMedia && window.matchMedia("(max-width: 599px)").matches;

    if (!isCarousel) {
      dots.hidden = true;
      return;
    }

    // Mark the track as a carousel for assistive tech (once).
    if (!grid.hasAttribute("role")) {
      grid.setAttribute("role", "group");
      grid.setAttribute("aria-roledescription", "carousel");
      grid.setAttribute("tabindex", "0");
    }

    const cards = grid.querySelectorAll(".room-card");
    const update = () => {
      const idx = carouselActiveIndex(grid);
      for (let i = 0; i < dots.children.length; i++) {
        const on = i === idx;
        dots.children[i].classList.toggle("is-active", on);
        if (on) dots.children[i].setAttribute("aria-current", "true");
        else dots.children[i].removeAttribute("aria-current");
      }
    };

    // Rebuild dots to match the rendered cards.
    dots.innerHTML = "";
    if (cards.length > 1) {
      dots.hidden = false;
      for (let i = 0; i < cards.length; i++) {
        (function (idx) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "rooms-preview__dot";
          b.setAttribute("aria-label", carouselDotLabel(idx + 1, cards.length));
          b.addEventListener("click", () => carouselGoTo(grid, idx));
          dots.appendChild(b);
        })(i);
      }
    } else {
      dots.hidden = true;
    }

    // The browser can snap to a later card when content is injected
    // asynchronously (loading placeholder -> cards). Pin the track to
    // the first card, direction-aware, without scrolling the page.
    if (cards.length) {
      carouselGoTo(grid, 0);
    }

    if (!grid.__carouselBound) {
      grid.__carouselBound = true;
      let ticking = false;
      const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => { ticking = false; update(); });
      };
      grid.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      grid.addEventListener("keydown", (e) => {
        const dir = grid.getAttribute("dir") || getComputedStyle(grid).direction || "ltr";
        const next = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
        const prev = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
        if (e.key === next) { e.preventDefault(); carouselGoTo(grid, carouselActiveIndex(grid) + 1); }
        else if (e.key === prev) { e.preventDefault(); carouselGoTo(grid, carouselActiveIndex(grid) - 1); }
      });
    }
    update();
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
