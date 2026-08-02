/* =========================================================
   src/config/env.js — Environment configuration.
   Loads and validates required environment variables.
   No secrets are ever returned to the frontend.
   ========================================================= */
const crypto = require("crypto");
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

// Generate a cryptographically secure secret if none provided (dev only).
function getJwtSecret() {
  const raw = process.env.JWT_SECRET || "";
  if (raw && raw !== "change-this-to-a-long-random-secret") return raw;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set to a strong random value in production");
  }
  // Dev fallback: generate a random secret that changes per restart.
  // This forces developers to set a real secret.
  console.warn("[ENV] WARNING: Using auto-generated JWT_SECRET. Set JWT_SECRET in .env for persistence.");
  return crypto.randomBytes(48).toString("hex");
}

const ENV = {
  PORT: parseInt(process.env.PORT || "8080", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_SECRET: getJwtSecret(),
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || "",
  PAYMENT_MODE: process.env.PAYMENT_MODE || "demo",
  PAYMOB_API_KEY: process.env.PAYMOB_API_KEY || "",
  PAYMOB_HMAC_SECRET: process.env.PAYMOB_HMAC_SECRET || "",
  PAYMOB_IFRAME_ID: process.env.PAYMOB_IFRAME_ID || "",
  PAYMOB_INTEGRATION_ID: process.env.PAYMOB_INTEGRATION_ID || "",
  PAYMOB_BASE_URL: process.env.PAYMOB_BASE_URL || "https://accept.paymob.com",

  // Booking payment timeout / no-show scheduler.
  // Canonical var: BOOKING_PAYMENT_TIMEOUT_MINUTES (default 120 = 2 hours).
  // Legacy alias BOOKING_PAYMENT_EXPIRY_MINUTES still honoured.
  BOOKING_PAYMENT_TIMEOUT_MINUTES: positiveInt(
    process.env.BOOKING_PAYMENT_TIMEOUT_MINUTES || process.env.BOOKING_PAYMENT_EXPIRY_MINUTES || "120",
    120
  ),
  NO_SHOW_GRACE_HOURS: positiveInt(process.env.NO_SHOW_GRACE_HOURS || "24", 24),
  SCHEDULER_INTERVAL_MS: positiveInt(process.env.SCHEDULER_INTERVAL_MS || String(5 * 60 * 1000), 5 * 60 * 1000)
};

// Scheduler/lifecycle numbers must be sane positive integers. A NaN or zero
// timeout would make the expiry cutoff an Invalid Date (no bookings ever match);
// a NaN/zero interval would corrupt setInterval. Fall back to safe defaults.
function positiveInt(v, fallback) {
  const n = parseInt(v, 10);
  return (Number.isInteger(n) && n > 0) ? n : fallback;
}

ENV.IS_PRODUCTION = ENV.NODE_ENV === "production";

// Rate-limit tuning — dev-friendly defaults, strict in production.
ENV.LOGIN_RATE_LIMIT_MAX = parseInt(process.env.LOGIN_RATE_LIMIT_MAX || (ENV.IS_PRODUCTION ? "8" : "50"), 10);
ENV.LOGIN_RATE_LIMIT_WINDOW_MS = parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10);

// Validate critical secrets at startup.
const required = ["DATABASE_URL"];
if (ENV.IS_PRODUCTION) {
  required.push("JWT_SECRET", "PAYMOB_API_KEY", "PAYMOB_HMAC_SECRET", "FRONTEND_ORIGIN");
  if (ENV.PAYMENT_MODE === "demo") {
    throw new Error("PAYMENT_MODE must not be 'demo' in production. Set PAYMENT_MODE=paymob and provide real Paymob credentials.");
  }
}
if (ENV.PAYMENT_MODE !== "demo" && ENV.PAYMENT_MODE !== "paymob") {
  throw new Error("PAYMENT_MODE must be 'demo' or 'paymob', got: " + ENV.PAYMENT_MODE);
}
for (const key of required) {
  if (!ENV[key]) {
    throw new Error("Missing required environment variable: " + key);
  }
}

module.exports = ENV;
