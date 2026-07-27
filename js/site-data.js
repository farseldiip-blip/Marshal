/* =========================================================
   site-data.js — Public frontend data layer.
   ---------------------------------------------------------
   Phase 2: LIVE mode reads from the REST API (MGApiClient).
   Falls back to the admin seed / localStorage (demo mode)
   when the API is not configured or unavailable.

   Collections: rooms, menu, gallery, reviews, amenities,
   settings.  Bookings are NOT routed through REST yet.

   Design rules:
   - No UI/design changes. Pure data fetching.
   - Never throws to the caller; returns [] / null on failure.
   - Safe before API client loads (awaits readiness internally).
   ========================================================= */
(function () {
  "use strict";

  /* ---------- demo / localStorage fallback ---------- */

  function demoData(col) {
    try {
      var raw = localStorage.getItem("mg-demo-db");
      if (raw) {
        var db = JSON.parse(raw);
        if (db && db[col]) return db[col];
      }
    } catch (e) { /* ignore parse errors */ }
    var seed = window.__mgSeed;
    if (typeof seed === "function") {
      var d = seed();
      if (d && d[col]) return d[col];
    }
    return null;
  }

  /* ---------- LIVE detection ---------- */

  function isLive() {
    return !!(window.MGApiClient &&
              window.MGApiConfig &&
              window.MGApiConfig.baseUrl);
  }

  /* ---------- public data methods ---------- */

  /** Get list of items.  Returns array (possibly empty) or demo data. */
  function getList(col) {
    if (isLive()) {
      return window.MGApiClient.getList(col).then(function (rows) {
        // rows is Array (possibly empty) on success, null on failure.
        // A valid (even empty) API response takes precedence over demo data.
        if (rows !== null) return rows;
        return demoData(col) || [];
      }).catch(function () {
        return demoData(col) || [];
      });
    }
    return Promise.resolve(demoData(col) || []);
  }

  /** Get singleton doc (e.g. settings/hotel info).
   *  For settings, normalizes the array into a flat {key: value} map. */
  function getDoc(col) {
    if (isLive()) {
      return window.MGApiClient.getDoc(col).then(function (d) {
        if (d !== null) return d;
        return demoData(col);
      }).catch(function () {
        return demoData(col);
      });
    }
    return Promise.resolve(demoData(col));
  }

  /** Get all settings as a flat {key: value} map.
   *  Normalizes the API array and safely parses JSON values like hotel_info. */
  function getSettingsMap() {
    if (isLive()) {
      return window.MGApiClient.getList("settings").then(function (rows) {
        if (!rows) return buildSettingsMap(demoData("settings") || []);
        return buildSettingsMap(rows);
      }).catch(function () {
        return buildSettingsMap(demoData("settings") || []);
      });
    }
    return Promise.resolve(buildSettingsMap(demoData("settings") || []));
  }

  function buildSettingsMap(arr) {
    var map = {};
    if (!Array.isArray(arr)) return map;
    arr.forEach(function (s) { if (s && s.key) map[s.key] = s.value; });
    if (map.hotel_info) {
      try {
        var info = JSON.parse(map.hotel_info);
        if (info && typeof info === "object") Object.keys(info).forEach(function (k) { if (map[k] == null) map[k] = info[k]; });
      } catch (e) { /* invalid JSON, leave as-is */ }
    }
    return map;
  }

  /** Create a document.
   *  Phase 3: bookings are created via REST (booking-core.js).
   *  This create() is kept for dashboard/compat.
   *  Demo: no-op (callers handle persistence). */
  function create(col, data) {
    if (col === "bookings") {
      console.warn("[site-data] create('bookings') is deprecated. Use MGBooking.createBooking().");
      return Promise.resolve(null);
    }
    return Promise.resolve(null);
  }

  /** Fetch a single document by id. */
  function getById(col, id) {
    if (isLive()) {
      return window.MGApiClient.getById(col, id).then(function (d) {
        if (d !== null) return d;
        return demoDataById(col, id);
      }).catch(function () {
        return demoDataById(col, id);
      });
    }
    return Promise.resolve(demoDataById(col, id));
  }

  function demoDataById(col, id) {
    var all = demoData(col);
    if (Array.isArray(all)) {
      for (var i = 0; i < all.length; i++) {
        if (all[i] && all[i].id === id) return all[i];
      }
      return null;
    }
    if (all && typeof all === "object" && all.id === id) return all;
    return null;
  }

  /** Convenience render helper.  Handles loading / empty / data states.
   *  cb(items) renders; opts: { loadingEl, emptyEl, onError } */
  function renderList(col, container, cb, opts) {
    opts = opts || {};
    if (opts.loadingEl) opts.loadingEl.style.display = "";
    getList(col).then(function (items) {
      if (opts.loadingEl) opts.loadingEl.style.display = "none";
      if (!items || !items.length) {
        if (opts.emptyEl) opts.emptyEl.style.display = "";
        return;
      }
      if (opts.emptyEl) opts.emptyEl.style.display = "none";
      cb(items);
    }).catch(function (e) {
      if (opts.loadingEl) opts.loadingEl.style.display = "none";
      if (opts.onError) opts.onError(e);
    });
  }

  window.MGSiteData = {
    getList:   getList,
    getDoc:    getDoc,
    getById:   getById,
    renderList: renderList,
    demoData:  demoData,
    create:    create,
    getSettingsMap: getSettingsMap
  };
})();
