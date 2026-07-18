/* =========================================================
   site-data.js — Public frontend data layer.
   ---------------------------------------------------------
   Loads Firestore collections (via MGFirebaseServices) and
   falls back to the admin seed (window.__mgSeed) when
   Firebase is not configured (demo mode). Firestore is the
   SINGLE SOURCE OF TRUTH once live.

   Collections: rooms, bookings, customers, reviews, gallery,
   menu, amenities, hotel, settings.

   Design rules:
   - No UI/design changes. Pure data fetching.
   - Never throws to the caller; returns [] / null on failure.
   - Safe before firebase boots (awaits readiness internally).
   ========================================================= */
(function () {
  "use strict";

  // Pull demo data. Prefer the SHARED demo store (mg-demo-db) so that
  // bookings created/edited on either the public site or the admin dashboard
  // are visible everywhere. Fall back to the canonical seed (seed-data.js)
  // only when the shared store hasn't been initialised yet.
  function demoData(col) {
    try {
      const raw = localStorage.getItem("mg-demo-db");
      if (raw) {
        const db = JSON.parse(raw);
        if (db && db[col]) return db[col];
      }
    } catch (e) {}
    const seed = window.__mgSeed;
    if (typeof seed === "function") {
      const d = seed();
      if (d && d[col]) return d[col];
    }
    return null;
  }

  async function getList(col) {
    const S = window.MGFirebaseServices;
    if (S && S.isLive()) {
      try {
        const rows = await S.list(col);
        if (Array.isArray(rows) && rows.length) return rows;
      } catch (e) { /* fall through to demo */ }
    }
    return demoData(col);
  }

  async function getDoc(col) {
    const S = window.MGFirebaseServices;
    if (S && S.isLive()) {
      try {
        const d = await S.getDoc(col);
        if (d) return d;
      } catch (e) { /* fall through */ }
    }
    return demoData(col);
  }

  // Create a document. Live: Firestore via MGFirebaseServices.
  // Demo: no-op storage (callers handle demo persistence themselves).
  async function create(col, data) {
    const S = window.MGFirebaseServices;
    if (S && S.isLive()) {
      const saved = await S.add(col, data);
      // Re-read so the server-stamped accessToken (onBookingCreate
      // trigger) is captured and returned to the booking owner.
      if (saved && saved.id) {
        const full = await S.getById(col, saved.id);
        if (full) return full;
      }
      return saved;
    }
    return null;
  }

  // Convenience: render helper that handles loading / empty / data states.
  // cb(items) renders; opts: { loadingEl, emptyEl, onError }
  async function renderList(col, container, cb, opts) {
    opts = opts || {};
    if (opts.loadingEl) opts.loadingEl.style.display = "";
    try {
      const items = await getList(col);
      if (opts.loadingEl) opts.loadingEl.style.display = "none";
      if (!items || !items.length) {
        if (opts.emptyEl) opts.emptyEl.style.display = "";
        return;
      }
      if (opts.emptyEl) opts.emptyEl.style.display = "none";
      cb(items);
    } catch (e) {
      if (opts.loadingEl) opts.loadingEl.style.display = "none";
      if (opts.onError) opts.onError(e);
    }
  }

  window.MGSiteData = { getList, getDoc, renderList, demoData, create };
})();
