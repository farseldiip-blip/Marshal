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
    STATUS_MAP: STATUS_MAP,
    PAY_STATUS_MAP: PAY_STATUS_MAP
  };
})();
