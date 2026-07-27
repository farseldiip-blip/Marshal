/* =========================================================
   src/routes/payments.routes.js
   ========================================================= */
const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { requireAuth, requireAdmin } = require("../middleware/auth");

// Create hosted-checkout intent (ownership via accessToken).
router.post("/create-intent", paymentController.createIntentHandler);

// Demo payment confirmation (local dev mode only).
router.post("/demo/confirm", paymentController.demoConfirmHandler);

// Paymob webhook (raw body, no auth). Idempotent + HMAC verified.
// NOTE: mount this BEFORE express.json() if you need raw body; the
// app uses express.json() globally, Paymob sends JSON — fine.
router.post("/webhook", paymentController.webhookHandler);

// Refund (admin only).
router.post("/:id/refund", requireAuth, requireAdmin, paymentController.refundHandler);

module.exports = router;
