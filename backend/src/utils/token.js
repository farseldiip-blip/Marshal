/* =========================================================
   src/utils/token.js — Server-generated tokens.
   ========================================================= */
const crypto = require("crypto");

// Secure, unguessable booking ownership token. Returned ONLY to the
// booking owner in the create response; never trusted from the client
// for state changes.
function newAccessCode() {
  return crypto.randomBytes(24).toString("hex");
}

// Unique payment attempt id (idempotency key).
function newTxnId(bookingId) {
  return "txn_" + bookingId + "_" + crypto.randomBytes(8).toString("hex");
}

module.exports = { newAccessCode, newTxnId };
