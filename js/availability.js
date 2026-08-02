/* =========================================================
   availability.js — Live room availability indicator.
   ---------------------------------------------------------
   Thin frontend layer. The backend availability endpoint
   (GET /api/bookings/availability) remains the source of
   truth — this module NEVER re-computes availability.
   - Reuses MGBooking.getAvailability when loaded (live + demo).
   - Falls back to a direct GET of the same endpoint for pages
     that don't load booking-core (e.g. the rooms grid page).
   - Renders room-card badges + the booking-widget count
     ("Available: X of Y"), debounced with stale guards.
   - Refreshes on date/room changes and on "avail:refresh"
     (booking success / payment success / scheduler expiry).
   ========================================================= */
(function () {
  "use strict";

  var DEBOUNCE_MS = 350;

  function base() {
    return (window.MGApiConfig && window.MGApiConfig.baseUrl) || "";
  }

  function fmt(d) { return d.toISOString().split("T")[0]; }

  function tr(key, en, ar) {
    if (window.MGLang && window.MGLang.t) {
      var v = window.MGLang.t(key);
      if (v != null && v !== key) return v;
    }
    return (window.MGLang && window.MGLang.get && window.MGLang.get() === "ar") ? ar : en;
  }

  function readDates() {
    var ci = document.getElementById("bkCheckin");
    var co = document.getElementById("bkCheckout");
    if (ci && ci.value && co && co.value) return { checkIn: ci.value, checkOut: co.value };
    var ri = document.getElementById("rdIn");
    var ro = document.getElementById("rdOut");
    if (ri && ri.value && ro && ro.value) return { checkIn: ri.value, checkOut: ro.value };
    var today = new Date();
    return { checkIn: fmt(today), checkOut: fmt(new Date(today.getTime() + 86400000)) };
  }

  var _dates = readDates();
  function dates() { return _dates; }
  function setDates() { _dates = readDates(); }

  /* ---- availability check (backend is source of truth) ---- */
  function normalize(a) {
    if (!a) return { available: null, availableUnits: null };
    var units = (typeof a.availableUnits === "number") ? a.availableUnits : (a.available ? 1 : 0);
    return {
      available: a.available == null ? null : !!a.available,
      availableUnits: a.available == null ? null : units
    };
  }

  function check(roomId) {
    if (!roomId) return Promise.resolve({ available: null, availableUnits: null });
    // Prefer the shared booking layer (live + demo), which already wraps the
    // same backend endpoint. Never re-implement the availability calculation.
    if (window.MGBooking && window.MGBooking.getAvailability) {
      return window.MGBooking.getAvailability(roomId, _dates.checkIn, _dates.checkOut).then(normalize);
    }
    // Fallback for pages without booking-core (e.g. the rooms grid page).
    if (!base()) return Promise.resolve({ available: null, availableUnits: null });
    var url = base() + "/bookings/availability?roomId=" + encodeURIComponent(roomId)
      + "&checkIn=" + encodeURIComponent(_dates.checkIn)
      + "&checkOut=" + encodeURIComponent(_dates.checkOut);
    return fetch(url, { method: "GET", headers: { Accept: "application/json" } })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json || json.ok !== true || !json.data) return { available: null, availableUnits: null };
        return {
          available: !!json.data.available,
          availableUnits: typeof json.data.availableUnits === "number" ? json.data.availableUnits : (json.data.available ? 1 : 0)
        };
      })
      .catch(function () { return { available: null, availableUnits: null }; });
  }

  /* ---- totals (room quantity, resolved from live/demo data) ---- */
  var _roomsPromise = null;
  function loadRooms() {
    if (_roomsPromise) return _roomsPromise;
    _roomsPromise = Promise.resolve([]);
    if (window.MGSiteData && window.MGSiteData.getList) {
      _roomsPromise = window.MGSiteData.getList("rooms").then(function (rows) { return rows || []; }).catch(function () { return []; });
    } else if (window.MGApiClient && window.MGApiClient.getList) {
      _roomsPromise = window.MGApiClient.getList("rooms").then(function (rows) { return rows || []; }).catch(function () { return []; });
    }
    return _roomsPromise;
  }

  function totalFor(roomId) {
    return loadRooms().then(function (rows) {
      for (var i = 0; i < rows.length; i++) {
        if (rows[i] && rows[i].id === roomId) {
          var q = parseInt(rows[i].quantity, 10);
          return (isNaN(q) || q < 1) ? 1 : q;
        }
      }
      return 1;
    });
  }

  /* ---- badge rendering ---- */
  var _seq = 0;
  var _badgeCache = {};

  function badgeLabel(units) {
    if (units <= 0) return tr("av_none", "Currently unavailable", "غير متاح حاليًا");
    if (units === 1) return tr("av_one", "Only 1 room left", "متبقي غرفة واحدة فقط");
    if (units < 6) return tr("av_few", "{{n}} rooms left", "متبقي {{n}} غرف").replace("{{n}}", String(units));
    return tr("av_ok", "Available now", "متاح الآن");
  }

  function renderBadge(el, units) {
    if (units == null) {
      el.hidden = false;
      el.className = "room-card__avail room-card__avail--checking";
      el.textContent = tr("av_checking", "Checking availability…", "جارٍ التحقق…");
      return;
    }
    var cls = units <= 0 ? "none" : units === 1 ? "one" : units < 6 ? "few" : "ok";
    el.hidden = false;
    el.className = "room-card__avail room-card__avail--" + cls;
    el.textContent = badgeLabel(units);

    var card = el.closest(".room-card");
    if (!card) return;
    var unavailable = units <= 0;
    card.classList.toggle("room-card--unavailable", unavailable);
    var cta = card.querySelector(".room-card__cta");
    if (cta) {
      if (unavailable) {
        cta.setAttribute("aria-disabled", "true");
        cta.setAttribute("tabindex", "-1");
      } else {
        cta.removeAttribute("aria-disabled");
        cta.removeAttribute("tabindex");
      }
    }
  }

  function scanBadges(seq) {
    var els = document.querySelectorAll("[data-avail-badge]");
    if (!els.length) return;
    els.forEach(function (el) {
      var roomId = el.getAttribute("data-avail-badge");
      if (!roomId) return;
      renderBadge(el, null);
      Promise.all([check(roomId), totalFor(roomId)]).then(function (r) {
        if (seq !== _seq) return;
        _badgeCache[roomId] = r[0];
        renderBadge(el, r[0].availableUnits);
      });
    });
  }

  /* ---- booking-widget count ("Available: X of Y") ---- */
  function scanCount(seq) {
    var el = document.getElementById("bkAvail");
    if (!el) return;
    var roomEl = document.getElementById("bkRoom");
    var roomId = roomEl && roomEl.value;
    if (!roomId) { el.hidden = true; return; }
    el.hidden = false;
    el.className = "bk-avail bk-avail--checking";
    el.textContent = tr("av_checking", "Checking availability…", "جارٍ التحقق…");
    Promise.all([check(roomId), totalFor(roomId)]).then(function (r) {
      if (seq !== _seq) return;
      var avail = r[0].available;
      if (avail == null) { el.hidden = true; return; }
      var units = r[0].availableUnits, total = r[1];
      var label = tr("av_count", "Available: {{x}} of {{y}}", "الغرف المتاحة: {{x}} من {{y}}")
        .replace("{{x}}", String(units)).replace("{{y}}", String(total));
      el.className = "bk-avail bk-avail--" + (units <= 0 ? "none" : units === 1 ? "one" : units < 6 ? "few" : "ok");
      el.textContent = label;
      var searchBtn = document.getElementById("bkSearch");
      if (searchBtn) searchBtn.disabled = units <= 0;
    });
  }

  function refresh() {
    var seq = ++_seq;
    setDates();
    scanBadges(seq);
    scanCount(seq);
  }

  var _deb = null;
  function scheduleRefresh() {
    if (_deb) clearTimeout(_deb);
    _deb = setTimeout(refresh, DEBOUNCE_MS);
  }

  function onFieldChange(e) {
    var id = e.target && e.target.id;
    if (id === "bkCheckin" || id === "bkCheckout" || id === "rdIn" || id === "rdOut" || id === "bkRoom") {
      scheduleRefresh();
    }
  }

  function init() {
    document.addEventListener("change", onFieldChange, true);
    document.addEventListener("input", onFieldChange, true);
    document.addEventListener("avail:refresh", refresh);
    document.addEventListener("rooms:rendered", refresh);
    document.addEventListener("lang:change", function () { setTimeout(refresh, 80); });
    setTimeout(refresh, 120);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.MGAvailability = {
    dates: dates,
    check: check,
    refresh: refresh
  };
})();
