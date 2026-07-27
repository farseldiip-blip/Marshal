/* =========================================================
   src/controllers/paymentController.js
   ========================================================= */
const { createIntent, confirmDemoPayment, handleWebhook, refundPayment } = require("../services/paymentService");
const { ValidationError } = require("../utils/errors");

function createIntentHandler(req, res, next) {
  const { bookingId, accessToken } = req.body || {};
  if (!bookingId) return next(Object.assign(new Error("bookingId required"), { status: 422, code: "VALIDATION" }));
  createIntent({ bookingId, accessToken })
    .then((r) => res.json(r))
    .catch(next);
}

function demoConfirmHandler(req, res, next) {
  const { bookingId, txnId, accessToken } = req.body || {};
  if (!bookingId || !txnId || !accessToken) {
    return next(new ValidationError("missing_bookingId_or_txnId_or_accessToken"));
  }
  confirmDemoPayment({ bookingId, txnId, accessToken })
    .then((r) => res.json(r))
    .catch(next);
}

function webhookHandler(req, res, next) {
  handleWebhook(req)
    .then(() => res.status(200).send("ok"))
    .catch((e) => {
      if (e.code === "NOT_FOUND") return res.status(200).send("ok");
      return res.status(422).send("update_failed");
    });
}

function refundHandler(req, res, next) {
  const { id } = req.params;
  refundPayment(id)
    .then((r) => res.json(r))
    .catch(next);
}

module.exports = { createIntentHandler, demoConfirmHandler, webhookHandler, refundHandler };
