/* =========================================================
   shared.js — Canonical helpers used across the site.
   ---------------------------------------------------------
   Provides a single source of truth for:
     esc()           — HTML XSS escape (wraps MGSanitize.esc)
     t(key, en, ar)  — i18n translation helper
     money(n)        — Currency formatting via MGSettings
     normalizeBooking(b) — Backend enum → Title Case mapping
   ========================================================= */
(function () {
  "use strict";

  /* ---------- esc() — HTML escape ---------- */
  function esc(s) {
    if (window.MGSanitize && MGSanitize.esc) return MGSanitize.esc(s);
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------- t() — i18n translation ---------- */
  function t(key, en, ar) {
    var lang = window.MGLang && window.MGLang.get && window.MGLang.get();
    return lang === "ar" ? (ar || en) : en;
  }

  /* ---------- money() — Currency formatting ---------- */
  function money(n) {
    if (window.MGSettings && MGSettings.formatMoney) return MGSettings.formatMoney(n);
    if (n == null || n === "") return "\u2014";
    var v = Number(n);
    if (isNaN(v) || !isFinite(v)) return "\u2014";
    var code = (window.MGSettings && MGSettings.getCurrency) ? MGSettings.getCurrency() : "USD";
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: code, currencyDisplay: "symbol",
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(v);
  }

  /* ---------- sanitizeAmenities() — clean amenity list ----------
     Render-layer hygiene: trims, dedupes, drops empty/null tokens and
     obvious placeholder/repeated-char junk (e.g. "gg", "v", "n/a").
     Never invents content — it only removes malformed entries. */
  function sanitizeAmenities(list) {
    if (!Array.isArray(list)) return [];
    var seen = {}, out = [];
    list.forEach(function (a) {
      if (typeof a !== "string") return;
      var v = a.trim().replace(/\s+/g, " ");
      if (!v || v.length < 2) return;
      if (/^(n\/a|na|none|null|undefined|placeholder|test|testing|sample|lorem.*)$/i.test(v)) return;
      if (/^(.)\1+$/.test(v)) return; // "gg", "ff", "www", "vv"
      var key = v.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(v);
    });
    return out.slice(0, 8);
  }

  /* ---------- normalizeRoom() — raw DB / API row → renderable card ----------
     Handles BOTH shapes used across the site:
       live API:  { images:[], description, type }
       demo seed: { image, desc, name_ar, desc_ar, size, featured }
     Returns a clean object, or null for rows that are unusable. */
  function normalizeRoom(r) {
    if (!r || typeof r !== "object") return null;
    var id = r.id != null ? String(r.id) : "";
    if (!id) return null;

    var images = [];
    if (Array.isArray(r.images)) {
      images = r.images
        .filter(function (u) { return typeof u === "string" && /^https?:\/\//i.test(u.trim()) && u.trim().length > 10; })
        .map(function (u) { return u.trim(); });
    }
    if (!images.length && typeof r.image === "string" && /^https?:\/\//i.test(r.image.trim()) && r.image.trim().length > 10) {
      images = [r.image.trim()];
    }

    function pickStr() {
      for (var i = 0; i < arguments.length; i++) {
        if (typeof arguments[i] === "string" && arguments[i].trim()) return arguments[i].trim();
      }
      return "";
    }

    var price = null;
    if (typeof r.price === "number" && isFinite(r.price)) price = r.price;
    else if (typeof r.price === "string" && r.price.trim() !== "" && isFinite(parseFloat(r.price))) price = parseFloat(r.price);

    return {
      id: id,
      name: pickStr(r.name),
      name_ar: pickStr(r.name_ar),
      type: pickStr(r.type),
      description: pickStr(r.description, r.desc),
      desc_ar: pickStr(r.desc_ar),
      price: price,
      images: images,
      amenities: sanitizeAmenities(r.amenities)
    };
  }

  /* ---------- normalizeBooking() — Backend → frontend ---------- */
  var STATUS_MAP = {
    "PENDING": "Pending", "CONFIRMED": "Confirmed",
    "CHECKED_IN": "Checked In", "CHECKED_OUT": "Checked Out",
    "CANCELLED": "Cancelled"
  };
  var PAY_STATUS_MAP = {
    "UNPAID": "Unpaid", "PENDING": "Pending",
    "PAID": "Paid", "FAILED": "Failed", "REFUNDED": "Refunded"
  };

  function normalizeBooking(b) {
    if (!b) return b;
    var out = Object.assign({}, b);
    if (out.status && STATUS_MAP[out.status]) out.status = STATUS_MAP[out.status];
    if (out.paymentStatus && PAY_STATUS_MAP[out.paymentStatus]) out.paymentStatus = PAY_STATUS_MAP[out.paymentStatus];
    if (out.createdAt && !out.created) out.created = out.createdAt;
    return out;
  }

  /* ---------- Expose globally ---------- */
  window.MGShared = {
    esc: esc,
    t: t,
    money: money,
    normalizeBooking: normalizeBooking,
    sanitizeAmenities: sanitizeAmenities,
    normalizeRoom: normalizeRoom,
    STATUS_MAP: STATUS_MAP,
    PAY_STATUS_MAP: PAY_STATUS_MAP
  };
})();
