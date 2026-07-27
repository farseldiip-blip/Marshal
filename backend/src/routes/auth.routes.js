/* =========================================================
   src/routes/auth.routes.js
   ---------------------------------------------------------
   SECURITY: Registration is USER-only. No admin self-register.
   ---------------------------------------------------------
   DEV ONLY: POST /api/auth/rate-limit-reset clears the login
   rate-limit store. Only available when NODE_ENV !== "production".
   ========================================================= */
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");
const { authLimiter, strictAuthLimiter, resetStrictAuthStore } = require("../middleware/rateLimit");
const { validate } = require("../middleware/validate");
const { z } = require("zod");
const ENV = require("../config/env");

const registerSchema = z.object({
  email: z.string().email("invalid_email").max(254),
  password: z.string().min(8, "password min 8 chars").max(128)
});

const loginSchema = z.object({
  email: z.string().email("invalid_email").max(254),
  password: z.string().min(1, "password required").max(128)
});

// Registration: user only, rate-limited.
router.post("/register", authLimiter, validate(registerSchema), authController.registerHandler);

// Login: strict rate limit to prevent brute-force.
router.post("/login", strictAuthLimiter, validate(loginSchema), authController.loginHandler);

// Current user: requires valid JWT.
router.get("/me", requireAuth, authController.meHandler);

// Dev-only: reset login rate-limit store.
if (!ENV.IS_PRODUCTION) {
  router.post("/rate-limit-reset", (req, res) => {
    resetStrictAuthStore();
    res.json({ ok: true, message: "Login rate-limit store cleared" });
  });
}

module.exports = router;
