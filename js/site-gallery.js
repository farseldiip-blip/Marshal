/* =========================================================
   site-gallery.js — Renders gallery grids AND the mobile
   cinematic preview + lightbox from the shared data layer
   (Firestore -> demo seed fallback).
   - Desktop / tablet: identical .g-item masonry + shared
     lightbox (unchanged behaviour).
   - Homepage phones (<=599px): featured 4:5 image, thumbnail
     strip, compact counter, and a dedicated full-screen
     lightbox with prev/next, swipe, keyboard, focus restore
     and browser-back support.
   Single cached fetch -> no duplicate gallery requests.
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

  /* ---------- shared (cached) gallery data ---------- */
  var _itemsPromise = null;
  function galleryItems() {
    if (!_itemsPromise && window.MGSiteData) {
      _itemsPromise = window.MGSiteData.getList("gallery")
        .then(function (rows) { return rows || []; })
        .catch(function () { return []; });
    }
    return _itemsPromise;
  }

  var isMobileMQ = window.matchMedia ? window.matchMedia("(max-width: 599px)") : null;
  var motionMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  function mobileView() { return !!(isMobileMQ && isMobileMQ.matches); }
  function reducedMotion() { return !!(motionMQ && motionMQ.matches); }

  function pad(v) { return String(v).padStart(2, "0"); }
  function counterText(i, n) { return pad(i + 1) + " / " + pad(n); }

  function label(key, n, m) {
    var s = (window.MGLang && window.MGLang.t) ? window.MGLang.t(key) : key;
    return s.replace("{{n}}", String(n)).replace("{{m}}", String(m));
  }

  /* ---------- desktop / tablet masonry (existing behaviour) ---------- */
  async function renderGallery(grid) {
    if (!grid || !window.MGSiteData) return;
    const loading = grid.parentElement ? grid.parentElement.querySelector(".dash-loading") : null;
    const empty = grid.parentElement ? grid.parentElement.querySelector(".gallery-empty") : null;
    if (loading) loading.style.display = "";

    let items = [];
    try { items = await galleryItems() || []; }
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

  /* ---------- homepage mobile cinematic preview ---------- */
  var preview = { items: [], index: 0 };

  function esc(s) { return String(s).replace(/"/g, "&quot;"); }

  function buildStrip() {
    var strip = document.getElementById("galleryStrip");
    if (!strip) return;
    strip.innerHTML = "";
    strip.setAttribute("aria-label", label("gal_strip_label", 1, preview.items.length));
    preview.items.forEach(function (g, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gallery-thumb" + (i === 0 ? " is-active" : "");
      btn.setAttribute("aria-label", label("gal_thumb", i + 1, preview.items.length));
      var img = document.createElement("img");
      img.src = sized(g.url, 300);
      img.alt = esc(g.title || "Gallery");
      img.loading = "lazy";
      img.decoding = "async";
      img.width = 96;
      img.height = 120;
      btn.appendChild(img);
      btn.addEventListener("click", function () { selectImage(i, true); });
      strip.appendChild(btn);
    });
  }

  function preload(url, onload) {
    var im = new Image();
    im.onload = onload;
    im.onerror = onload;
    im.src = url;
  }

  function preloadNeighbors(i) {
    if (i - 1 >= 0) preload(sized(preview.items[i - 1].url, 1200));
    if (i + 1 < preview.items.length) preload(sized(preview.items[i + 1].url, 1200));
  }

  function selectImage(i, animate) {
    if (!preview.items.length) return;
    i = Math.max(0, Math.min(preview.items.length - 1, i));
    preview.index = i;
    var g = preview.items[i];
    var stage = document.getElementById("galleryStage");
    var stageImg = document.getElementById("galleryStageImg");
    var count = document.getElementById("galleryStageCount");
    var url = sized(g.url, 1200);

    if (stage) stage.setAttribute("aria-label", label("gal_open", i + 1, preview.items.length));
    if (count) count.textContent = counterText(i, preview.items.length);

    var strip = document.getElementById("galleryStrip");
    if (strip) {
      var thumbs = strip.querySelectorAll(".gallery-thumb");
      thumbs.forEach(function (b, k) {
        b.classList.toggle("is-active", k === i);
        b.setAttribute("aria-current", k === i ? "true" : "false");
      });
      if (thumbs[i]) thumbs[i].scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", inline: "center", block: "nearest" });
    }

    if (stageImg && stageImg.getAttribute("src") !== url) {
      var alt = esc(g.title || "Gallery");
      if (animate && !reducedMotion()) {
        stageImg.classList.add("is-loading");
        preload(url, function () {
          stageImg.setAttribute("src", url);
          stageImg.alt = alt;
          stageImg.classList.remove("is-loading");
        });
      } else {
        stageImg.setAttribute("src", url);
        stageImg.alt = alt;
      }
    }
    preloadNeighbors(i);
  }

  function renderPreview(items) {
    var root = document.getElementById("galleryPreview");
    var strip = document.getElementById("galleryStrip");
    var emptyEl = document.getElementById("galleryPreviewEmpty");
    if (!root) return;
    preview.items = items || [];
    root.hidden = false;
    if (!preview.items.length) {
      if (strip) strip.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (strip) strip.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
    buildStrip();
    selectImage(0, false);
  }

  /* ---------- preview lightbox ---------- */
  var lb = { open: false, pushed: false, trigger: null, prevOverflow: "" };

  function lbEl() { return document.getElementById("galleryLightbox"); }

  function lbSet(i, animate) {
    if (!preview.items.length) return;
    i = Math.max(0, Math.min(preview.items.length - 1, i));
    var g = preview.items[i];
    var img = document.getElementById("galleryLbImg");
    var count = document.getElementById("galleryLbCount");
    var prev = document.getElementById("galleryLbPrev");
    var next = document.getElementById("galleryLbNext");
    var url = sized(g.url, 1600);

    if (count) count.textContent = counterText(i, preview.items.length);
    if (prev) prev.disabled = i <= 0;
    if (next) next.disabled = i >= preview.items.length - 1;
    if (i - 1 >= 0) preload(sized(preview.items[i - 1].url, 1600));
    if (i + 1 < preview.items.length) preload(sized(preview.items[i + 1].url, 1600));

    if (img && img.getAttribute("src") !== url) {
      var alt = esc(g.title || "Gallery");
      if (animate && !reducedMotion()) {
        img.classList.add("is-loading");
        preload(url, function () {
          img.setAttribute("src", url);
          img.alt = alt;
          img.classList.remove("is-loading");
        });
      } else {
        img.setAttribute("src", url);
        img.alt = alt;
      }
    }
  }

  function lbNav(d) { lbSet(preview.index + d, true); }

  function closeVisuals() {
    var box = lbEl();
    lb.open = false;
    if (box) {
      box.classList.remove("open");
      window.setTimeout(function () { box.hidden = true; }, reducedMotion() ? 0 : 400);
    }
    document.body.style.overflow = lb.prevOverflow;
    lb.prevOverflow = "";
    if (lb.trigger && lb.trigger.focus) lb.trigger.focus();
    lb.trigger = null;
  }

  function lbClose() {
    if (!lb.open) return;
    if (lb.pushed) {
      lb.pushed = false;
      try { history.back(); } catch (e) { closeVisuals(); }
    } else {
      closeVisuals();
    }
  }

  function lbOpen() {
    var box = lbEl();
    if (lb.open || !box || !preview.items.length) return;
    lb.open = true;
    lb.trigger = document.activeElement;
    lb.prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    box.hidden = false;
    window.requestAnimationFrame(function () { box.classList.add("open"); });
    lbSet(preview.index, false);
    var close = document.getElementById("galleryLbClose");
    if (close) close.focus();
    try { history.pushState({ mgGalleryLb: 1 }, ""); lb.pushed = true; } catch (e) { lb.pushed = false; }
  }

  /* ---------- wire lightbox events ---------- */
  function bindLightbox() {
    var box = lbEl();
    if (!box) return;
    var closeBtn = document.getElementById("galleryLbClose");
    var prevBtn = document.getElementById("galleryLbPrev");
    var nextBtn = document.getElementById("galleryLbNext");
    var stage = document.getElementById("galleryStage");

    if (stage) stage.addEventListener("click", lbOpen);
    if (closeBtn) closeBtn.addEventListener("click", lbClose);
    if (prevBtn) prevBtn.addEventListener("click", function () { lbNav(-1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { lbNav(1); });
    box.addEventListener("click", function (e) { if (e.target === box) lbClose(); });

    // keyboard nav (only while open); arrows follow reading direction
    document.addEventListener("keydown", function (e) {
      if (!lb.open) return;
      if (e.key === "Escape") { e.preventDefault(); lbClose(); return; }
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var rtl = document.documentElement.getAttribute("dir") === "rtl";
      var forward = rtl ? "ArrowLeft" : "ArrowRight";
      var backward = rtl ? "ArrowRight" : "ArrowLeft";
      e.preventDefault();
      if (e.key === forward) lbNav(1);
      else if (e.key === backward) lbNav(-1);
    });

    // swipe nav (physical: left = next, right = previous)
    var tx = null, ty = null;
    box.addEventListener("touchstart", function (e) {
      var t = e.touches[0]; tx = t.clientX; ty = t.clientY;
    }, { passive: true });
    box.addEventListener("touchend", function (e) {
      if (tx == null) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - tx;
      var dy = t.clientY - ty;
      tx = ty = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) lbNav(1); else lbNav(-1);
    }, { passive: true });

    // browser back closes the lightbox (state was pushed on open)
    window.addEventListener("popstate", function () {
      if (lb.open) {
        lb.pushed = false;
        closeVisuals();
      }
    });
  }

  window.renderGallery = renderGallery;

  /* ---------- init ---------- */
  function init() {
    var grids = document.querySelectorAll(".masonry[id]");
    var homePreview = !!document.getElementById("galleryPreview");

    grids.forEach(function (grid) {
      if (homePreview && mobileView() && grid.id === "masonry") {
        // Phones: masonry is hidden via CSS; the preview replaces it.
        return;
      }
      renderGallery(grid);
    });

    if (homePreview) {
      bindLightbox();
      var sync = function () {
        galleryItems().then(function (items) {
          if (mobileView()) renderPreview(items);
          else {
            var root = document.getElementById("galleryPreview");
            if (root) root.hidden = true;
            preview.items = [];
          }
        });
      };
      sync();
      if (isMobileMQ && isMobileMQ.addEventListener) isMobileMQ.addEventListener("change", sync);
      else if (isMobileMQ && isMobileMQ.addListener) isMobileMQ.addListener(sync);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
