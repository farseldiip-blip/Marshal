/* =========================================================
   src/middleware/helmet.js — Security headers.
   ---------------------------------------------------------
   Configured for API-only backend serving JSON.
   ========================================================= */
const helmet = require("helmet");

module.exports = helmet({
  contentSecurityPolicy: false, // API-only, no inline HTML
  hsts: process.env.NODE_ENV === "production" ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: "no-referrer" },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
});
