/* =========================================================
   src/middleware/rateLimit.js — Rate limiting.
   ---------------------------------------------------------
   - apiLimiter: general API (300/15min)
   - bookingLimiter: booking creation (20/15min)
   - authLimiter: registration (20/15min)
   - strictAuthLimiter: login attempts (env-configurable per IP)
   - adminLimiter: admin operations (200/15min)
   ---------------------------------------------------------
   STORE: Each limiter uses an explicit MemoryStore instance.
   When the process exits (server restart), all in-memory state
   is destroyed. New process = fresh counters.
   ---------------------------------------------------------
   CACHE PREVENTION: 429 responses include Cache-Control:
   no-store to prevent browsers from caching rate-limit errors.
   ---------------------------------------------------------
   DEV RESET: In development, POST /api/auth/rate-limit-reset
   clears the login rate-limit store (not available in prod).
   ========================================================= */
const rateLimit = require("express-rate-limit");
const { MemoryStore } = rateLimit;
const ENV = require("../config/env");

/* ---- Explicit stores (one per limiter, process-scoped) ---- */
const apiStore = new MemoryStore();
const bookingStore = new MemoryStore();
const authStore = new MemoryStore();
const strictAuthStore = new MemoryStore();
const adminStore = new MemoryStore();
const reviewStore = new MemoryStore();

/* ---- Shared: prevent caching of 429 responses ---- */
function noCacheHeaders(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: apiStore,
  handler: (req, res) => {
    noCacheHeaders(res);
    res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests" } });
  }
});

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: bookingStore,
  handler: (req, res) => {
    noCacheHeaders(res);
    res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many booking attempts" } });
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: authStore,
  handler: (req, res) => {
    noCacheHeaders(res);
    res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many registration attempts" } });
  }
});

/* ---- Strict login limit ---- */
const strictAuthLimiter = rateLimit({
  windowMs: ENV.LOGIN_RATE_LIMIT_WINDOW_MS,
  max: ENV.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  store: strictAuthStore,
  handler: (req, res) => {
    noCacheHeaders(res);
    res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." } });
  }
});

/* ---- Review submission limit (5 per 15 min per IP) ---- */
const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: reviewStore,
  handler: (req, res) => {
    noCacheHeaders(res);
    res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many review submissions. Please try again later." } });
  }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  store: adminStore,
  handler: (req, res) => {
    noCacheHeaders(res);
    res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many admin requests" } });
  }
});

/* ---- Dev-only: reset function for login rate-limit store ---- */
function resetStrictAuthStore() {
  strictAuthStore.resetAll();
}

module.exports = {
  apiLimiter, bookingLimiter, authLimiter, strictAuthLimiter, adminLimiter, reviewLimiter,
  resetStrictAuthStore
};
