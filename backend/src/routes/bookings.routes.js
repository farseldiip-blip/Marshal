/* =========================================================
   src/routes/bookings.routes.js
   ---------------------------------------------------------
   SECURITY: Booking creation validates input via Zod schema.
   ========================================================= */
const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const { requireAuth, requireOptionalAuth } = require("../middleware/auth");
const { bookingLimiter } = require("../middleware/rateLimit");
const { validate } = require("../middleware/validate");
const schemas = require("../middleware/schemas");

// Public availability check (GET, lightweight).
router.get("/availability", bookingController.availability);

// Public booking lookup by reference + contact match.
router.post("/lookup", validate(schemas.bookingLookup), bookingController.lookup);

// Create booking (rate-limited + validated). Optional auth — if a valid
// JWT is provided the booking will be linked to the authenticated user.
router.post("/", requireOptionalAuth, bookingLimiter, validate(schemas.bookingCreate), bookingController.create);

// Authenticated user's own bookings (must be before /:id).
router.get("/mine", requireAuth, bookingController.mine);

// Get booking by id — access via accessToken (guest) or authenticated userId.
router.get("/:id", requireOptionalAuth, bookingController.getById);

module.exports = router;
