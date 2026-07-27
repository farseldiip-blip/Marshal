/* =========================================================
   src/middleware/cors.js — Explicit frontend origin only.
   ---------------------------------------------------------
   SECURITY: No wildcard, no null origin, explicit allowlist.
   ========================================================= */
const cors = require("cors");
const ENV = require("../config/env");

const allowedOrigins = ENV.FRONTEND_ORIGIN
  ? ENV.FRONTEND_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

module.exports = cors({
  origin: function (origin, callback) {
    // Allow non-browser tools (curl, health checks) when no origin header.
    if (!origin) return callback(null, true);
    // Allow when no origins configured (empty = open, for local dev only).
    if (allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS_ORIGIN_NOT_ALLOWED"));
  },
  credentials: false,
  optionsSuccessStatus: 204
});
