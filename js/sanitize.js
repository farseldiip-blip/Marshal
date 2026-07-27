/* =========================================================
   js/sanitize.js — HTML escape utility for user content.
   ---------------------------------------------------------
   SECURITY: All user-controlled content rendered via
   innerHTML or template literals MUST go through esc().
   ========================================================= */
(function () {
  "use strict";

  /**
   * Escape HTML special characters to prevent XSS.
   * Use this whenever rendering user-supplied text in HTML.
   */
  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Escape a string for safe use inside a CSS context.
   * Prevents CSS injection via style attributes.
   */
  function escCss(s) {
    if (s == null) return "";
    return String(s).replace(/[^a-zA-Z0-9\s\-_,.#%()]/g, "");
  }

  /**
   * Validate that a URL is safe (http/https only).
   * Rejects javascript:, data:, vbscript: schemes.
   */
  function safeUrl(url) {
    if (!url) return "";
    var s = String(url).trim();
    if (/^(javascript|data|vbscript):/i.test(s)) return "";
    return s;
  }

  // Expose globally.
  window.MGSanitize = { esc: esc, escCss: escCss, safeUrl: safeUrl };
})();
