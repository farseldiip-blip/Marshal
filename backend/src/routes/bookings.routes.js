/* =========================================================
   src/routes/bookings.routes.js
   ---------------------------------------------------------
   SECURITY: Booking creation validates input via Zod schema.
   ========================================================= */
const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const { bookingLimiter } = require("../middleware/rateLimit");
const { validate } = require("../middleware/validate");
const schemas = require("../middleware/schemas");

// Public availability check (GET, lightweight).
router.get("/availability", bookingController.availability);

// Public booking lookup by reference + contact match.
router.post("/lookup", validate(schemas.bookingLookup), bookingController.lookup);

// Create booking (rate-limited + validated).
router.post("/", bookingLimiter, validate(schemas.bookingCreate), bookingController.create);

// Get booking by id (requires accessToken query param).
router.get("/:id", bookingController.getById);

module.exports = router;
