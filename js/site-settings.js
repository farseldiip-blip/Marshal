/* =========================================================
   site-settings.js — Centralized settings for public pages.
   ---------------------------------------------------------
   Loads settings from GET /api/settings and normalizes them
   into a flat map. Canonical keys match data-setting attrs:

     hotelName  — display name of the hotel
     email      — contact email
     phone      — contact phone
     address    — contact address
     currency   — currency code/symbol (e.g. "EGP")
     lang       — "en" or "ar"
     theme      — "dark" or "light"

   Resolution order:
     1. Raw DB keys (hotelName, contactEmail, contactPhone,
        currency, lang, theme)
     2. hotel_info JSON fields as fallback for missing keys
     3. Alias: contactEmail→email, contactPhone→phone,
        hotel_info.name→hotelName

   Exposes: window.MGSettings
   ========================================================= */
(function () {
  "use strict";

  var state = {};
  var loaded = false;

  function isLive() {
    return !!(window.MGApiClient && window.MGApiConfig && window.MGApiConfig.baseUrl);
  }

  function base() {
    return (window.MGApiConfig && window.MGApiConfig.baseUrl) || "";
  }

  function buildFromSeed() {
    var seed = window.__mgSeed;
    if (typeof seed === "function") seed = seed();
    var hotel = (seed && seed.hotel) || {};
    var settings = (seed && seed.settings) || {};
    var out = {};
    // Map seed hotel.* to canonical keys
    if (hotel.name) out.hotelName = hotel.name;
    if (hotel.email) out.email = hotel.email;
    if (hotel.phone) out.phone = hotel.phone;
    if (hotel.address) out.address = hotel.address;
    if (hotel.tagline) out.tagline = hotel.tagline;
    if (hotel.about) out.about = hotel.about;
    // Map seed settings.*
    if (settings.currency) out.currency = settings.currency;
    if (settings.lang) out.lang = settings.lang;
    if (settings.theme) out.theme = settings.theme;
    return out;
  }

  /**
   * Normalize raw [{key, value}] from GET /api/settings.
   * Produces canonical map: { hotelName, email, phone, address,
   *   currency, lang, theme, ... }
   */
  function normalizeSettings(arr) {
    var map = {};
    if (!Array.isArray(arr)) return map;

    // Step 1: Raw DB records.
    arr.forEach(function (s) {
      if (s && s.key) map[s.key] = s.value;
    });

    // Step 2: Parse hotel_info JSON.
    var hotelInfo = null;
    if (map.hotel_info) {
      try { hotelInfo = JSON.parse(map.hotel_info); }
      catch (e) { console.warn("[SETTINGS] hotel_info parse failed:", e.message); }
    }

    // Step 3: Spread hotel_info as LOWER-PRIORITY fallbacks.
    // Only fill keys that don't already exist as standalone DB keys.
    if (hotelInfo && typeof hotelInfo === "object") {
      if (!map.hotelName && hotelInfo.name) map.hotelName = String(hotelInfo.name);
      if (!map.email && hotelInfo.email) map.email = String(hotelInfo.email);
      if (!map.phone && hotelInfo.phone) map.phone = String(hotelInfo.phone);
      if (!map.address && hotelInfo.address) map.address = String(hotelInfo.address);
      if (hotelInfo.tagline) map.tagline = String(hotelInfo.tagline);
      if (hotelInfo.about) map.about = String(hotelInfo.about);
    }

    // Step 4: Alias resolution — contact keys map to canonical names.
    if (map.contactEmail) map.email = map.contactEmail;
    if (map.contactPhone) map.phone = map.contactPhone;

    // Step 5: Defaults.
    if (!map.currency) map.currency = CURRENCY_CODE;
    if (!map.lang) map.lang = "en";
    if (!map.theme) map.theme = "light";

    return map;
  }

  function load() {
    if (!isLive()) {
      state = buildFromSeed();
      loaded = true;
      applyToDOM();
      document.dispatchEvent(new CustomEvent("settings:loaded"));
      return Promise.resolve(state);
    }

    var url = base() + "/settings";
    return fetch(url, { method: "GET", headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (json) {
        if (json.ok && Array.isArray(json.data)) {
          state = normalizeSettings(json.data);
        } else {
          state = buildFromSeed();
        }
        loaded = true;
        applyToDOM();
        document.dispatchEvent(new CustomEvent("settings:loaded"));
        return state;
      })
      .catch(function (e) {
        console.warn("[SETTINGS] API load failed:", e.message, "— using seed fallback");
        state = buildFromSeed();
        loaded = true;
        applyToDOM();
        document.dispatchEvent(new CustomEvent("settings:loaded"));
        return state;
      });
  }

  function get(key, fallback) {
    if (state[key] != null && state[key] !== "") return state[key];
    return fallback != null ? fallback : "";
  }

  function getAll() { return Object.assign({}, state); }

  /* ---- Currency configuration (single source of truth) ---- */
  var CURRENCY_CODE = "USD";
  var CURRENCY_LOCALE = "en-US";

  function getCurrency() { return get("currency", CURRENCY_CODE); }

  /** Safe number coercion. Returns 0 for null/undefined/NaN. */
  function safeNumber(n) {
    var v = Number(n);
    return isNaN(v) || !isFinite(v) ? 0 : v;
  }

  /** Core formatter: $300.00 — uses Intl.NumberFormat. */
  var _intlCache = {};
  function getFormatter(locale, code) {
    var key = locale + "|" + code;
    if (!_intlCache[key]) {
      _intlCache[key] = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: code,
        currencyDisplay: "symbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    return _intlCache[key];
  }

  /**
   * formatCurrency(amount, currencyCode) → e.g. "EGP 600.00", "$600.00"
   * Shared formatter: formats an amount using the given currency code.
   * Falls back to "USD" if currencyCode is falsy.
   * Returns "—" for null, undefined, NaN, or invalid values.
   */
  function formatCurrency(n, currencyCode) {
    if (n == null || n === "") return "—";
    var v = Number(n);
    if (isNaN(v) || !isFinite(v)) return "—";
    var code = currencyCode || CURRENCY_CODE;
    return getFormatter(CURRENCY_LOCALE, code).format(v);
  }

  /**
   * formatMoney(amount) → "$300.00"
   * Returns "—" for null, undefined, NaN, or invalid values.
   */
  function formatMoney(n) {
    return formatCurrency(n, getCurrency());
  }

  /**
   * formatMoneyCode(amount) → "$600.00 USD" or "EGP 600.00"
   * Intl.NumberFormat with currencyDisplay:"symbol" already includes the
   * currency (e.g. "$" for USD, "EGP" for EGP). Only append the ISO code
   * when the symbol differs from the code (e.g. "$" ≠ "USD" → append).
   */
  function formatMoneyCode(n) {
    var formatted = formatMoney(n);
    if (formatted === "\u2014") return formatted;
    var code = getCurrency();
    if (formatted.indexOf(code) !== -1) return formatted;
    return formatted + " " + code;
  }

  /**
   * formatMoneySigned(amount) → "-$300.00" for negatives, "$300.00" otherwise.
   */
  function formatMoneySigned(n) {
    if (n == null || n === "") return "—";
    var v = Number(n);
    if (isNaN(v) || !isFinite(v)) return "—";
    return formatMoney(v);
  }

  /**
   * Apply all settings to every data-setting element in the DOM.
   */
  function applyToDOM() {
    var counts = { hotelName: 0, email: 0, phone: 0, address: 0, currency: 0, other: 0 };

    // 1. textContent for every [data-setting]
    document.querySelectorAll("[data-setting]").forEach(function (el) {
      var key = el.getAttribute("data-setting");
      var val = get(key);
      if (val == null || val === "") return;

      // Brand mark: split "Marshal Al-Gezira" → textNode "Marshal" + <small> "Al-Gezira"
      if (key === "hotelName" && el.classList.contains("brand__mark")) {
        var parts = val.split(/\s+/);
        var main = parts[0] || val;
        var sub = parts.slice(1).join(" ");
        for (var i = 0; i < el.childNodes.length; i++) {
          if (el.childNodes[i].nodeType === Node.TEXT_NODE) {
            el.childNodes[i].textContent = main;
            break;
          }
        }
        var small = el.querySelector("small");
        if (small) {
          if (sub) small.textContent = sub;
          small.removeAttribute("data-i18n");
        }
        counts.hotelName++;
        return;
      }

      el.textContent = val;
      if (counts[key] !== undefined) counts[key]++;
      else counts.other++;
    });

    // 2. href for [data-setting-href]
    document.querySelectorAll("[data-setting-href]").forEach(function (el) {
      var type = el.getAttribute("data-setting-href");
      var val = get(type);
      if (val) {
        if (type === "email") el.href = "mailto:" + val;
        else if (type === "phone") el.href = "tel:" + val;
      }
    });

    // 3. Language sync
    var langVal = get("lang");
    if (langVal && window.MGLang && window.MGLang.apply) {
      localStorage.setItem("mg-lang", langVal);
      window.MGLang.apply(langVal);
    }

    // 4. Theme sync
    var themeVal = get("theme");
    if (themeVal) {
      document.documentElement.setAttribute("data-theme", themeVal);
      localStorage.setItem("mg-theme", themeVal);
    }
  }

  function refresh() { return load(); }

  window.MGSettings = {
    load: load,
    get: get,
    getAll: getAll,
    getCurrency: getCurrency,
    formatCurrency: formatCurrency,
    formatMoney: formatMoney,
    formatMoneyCode: formatMoneyCode,
    formatMoneySigned: formatMoneySigned,
    isLoaded: function () { return loaded; },
    refresh: refresh
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { load(); });
  } else {
    load();
  }
})();
