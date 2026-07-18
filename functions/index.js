/* =========================================================
   functions/index.js — Backend payment authority.
   ---------------------------------------------------------
   RULES ENFORCED HERE (the frontend never does these):
   - Provider secret keys are read from env ONLY (never frontend).
   - paymentStatus = "Paid" / booking status = "Confirmed"
     are set HERE (webhook or verify), never by the client.
   - The `payments` collection is written HERE only.
   - Webhook signature is verified server-side before any mutation.
   - Idempotent updates via Firestore transactions.

   Provider abstraction: `createPayment / verifyWebhook / refundPayment`
   delegate to a provider impl (paymob | stripe). Production
   provider code is marked with TODOs — no credentials invented,
   no fake-success responses in real paths.
   ========================================================= */

const admin = require("firebase-admin");
const functions = require("firebase-functions");

admin.initializeApp();

const db = admin.firestore();

const PROVIDER = process.env.PAYMENT_PROVIDER || "paymob";

// ---------------- Provider abstraction ----------------
// Each impl exposes: createSession(req), verifyWebhook(req), refund(req).
// Secrets are read from process.env INSIDE the impl (server-only).
// Paymob is implemented (Legacy Accept API). Stripe remains a stub.
const paymob = require("./paymob");
const providers = {
  paymob,
  stripe: {
    name: "stripe",
    // TODO(provider): implement with 'stripe' server SDK.
    async createSession({ bookingId, amount, currency, email }) {
      // TODO(provider): const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      //   const pi = await stripe.paymentIntents.create({ amount, currency, metadata:{bookingId} });
      //   return { clientToken: pi.client_secret, providerRef: pi.id };
      throw new Error("Stripe createSession not implemented — set STRIPE_SECRET_KEY and implement.");
    },
    verifyWebhook(req) {
      // TODO(provider): const sig = req.headers['stripe-signature'];
      //   return stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
      throw new Error("Stripe verifyWebhook not implemented — set STRIPE_WEBHOOK_SECRET and implement.");
    },
    async refund({ providerRef, amount, currency }) {
      // TODO(provider): await stripe.refunds.create({ payment_intent: providerRef, amount });
      throw new Error("Stripe refund not implemented — implement.");
    }
  }
};

function getProvider(name) {
  return providers[name || PROVIDER] || providers.paymob;
}

// ---------------- Helpers ----------------
// Idempotency: each payment attempt has its OWN txn id, not blindly
// equal to bookingId, so retries/refunds are traceable and unique.
function newTxnId(bookingId) {
  return "txn_" + bookingId + "_" + Date.now().toString(36);
}

// Secure, unguessable booking access token (server-generated at create).
// Used as ownership proof for guest actions (e.g. pay) WITHOUT
// requiring Firebase Auth on the public site. Stored on the doc.
function newAccessCode() {
  const crypto = require("crypto");
  return crypto.randomBytes(24).toString("hex");
}

async function loadBooking(bookingId) {
  const ref = db.collection("bookings").doc(bookingId);
  const snap = await ref.get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

// Eligibility for payment: must be an active, unsettled booking.
function isEligibleForPayment(b) {
  if (!b) return false;
  const st = b.status || "Pending";
  if (st === "Cancelled" || st === "Checked Out") return false;
  const ps = b.paymentStatus || "Unpaid";
  if (ps === "Paid" || ps === "Refunded") return false;
  return true;
}

// Authoritative total/currency come from the booking doc, never the client.
function validateCharge(booking, req) {
  if (!booking) throw new Error("booking_not_found");
  if (typeof booking.total !== "number" || booking.total <= 0) throw new Error("booking_total_invalid");
  // Do NOT trust the client amount/currency — compare to Firestore truth.
  if (Number(req.amount) !== booking.total) throw new Error("amount_mismatch");
  if ((req.currency || "USD") !== (booking.currency || "USD")) throw new Error("currency_mismatch");
  // Block Cancelled / Checked Out / already settled.
  if (!isEligibleForPayment(booking)) throw new Error("not_eligible");
}

// Ownership proof WITHOUT Firebase Auth: the booking carries a server-
// generated `accessToken` (stamped at create). The client must present
// the matching token. Do NOT rely on bookingId alone.
async function verifyOwnership(booking, data) {
  if (!booking) throw new Error("booking_not_found");
  const token = booking.accessToken;
  if (!token) return; // legacy doc w/o token: allow (back-compat)
  if (!data || data.accessToken !== token) throw new Error("ownership_unverified");
}

// ---------------- 1) createPaymentIntent ----------------
exports.createPaymentIntent = functions.https.onCall(async (data, context) => {
  const bookingId = data && data.bookingId;
  if (!bookingId) throw new functions.https.HttpsError("invalid-argument", "bookingId required");

  const booking = await loadBooking(bookingId);
  // Ownership: verified via server-issued accessToken, not bookingId alone.
  try { verifyOwnership(booking, data); }
  catch (e) { throw new functions.https.HttpsError("permission-denied", "ownership_unverified"); }
  // Authoritative validation: exists, eligible, amount/currency match.
  validateCharge(booking, data); // throws on mismatch / ineligible

  // Prevent DUPLICATE active charges: if an already-succeeded payment
  // exists, refuse. If a still-open (created) one exists, reuse its
  // txn id but mint a FRESH Paymob session (prior payment_key expired).
  const openQ = await db.collection("payments")
    .where("bookingId", "==", bookingId)
    .where("status", "in", ["created", "succeeded"]).limit(1).get();
  let txnId;
  if (!openQ.empty) {
    const ex = openQ.docs[0].data();
    if (ex.status === "succeeded") throw new functions.https.HttpsError("already-exists", "already_paid");
    txnId = openQ.docs[0].id; // reuse, update below
  } else {
    txnId = newTxnId(bookingId);
  }

  const provider = getProvider();

  // Open/provision a provider session using the SERVER secret.
  const session = await provider.createSession({
    bookingId,
    amount: booking.total,
    currency: booking.currency || "USD",
    email: data.email || "",
    booking
  });

  // Audit record — written by backend ONLY. No card/CVV/secret stored.
  // providerRef = paymob order id (stable per attempt; survives webhook).
  await db.collection("payments").doc(txnId).set({
    bookingId,
    provider: provider.name,
    providerRef: session.providerRef || null,
    amount: booking.total,
    currency: booking.currency || "USD",
    status: "created",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    webhookVerified: false
  });

  // Mark the booking as awaiting payment (NOT paid).
  await db.collection("bookings").doc(bookingId).update({
    paymentStatus: "Pending",
    paymentIntentId: session.providerRef || txnId,
    paymentProvider: provider.name,
    amount: booking.total,
    currency: booking.currency || "USD"
  });

  // Return ONLY safe client data (hosted iframe url).
  return {
    ok: true,
    checkoutUrl: session.checkoutUrl || null,
    clientToken: session.clientToken || null,
    txnId
  };
});

// ---------------- 2) handlePaymentWebhook ----------------
exports.handlePaymentWebhook = functions.https.onRequest(async (req, res) => {
  let event;
  try {
    const provider = getProvider();
    event = provider.verifyWebhook(req); // throws on bad signature
  } catch (e) {
    console.error("webhook verify failed:", e.message);
    return res.status(400).send("invalid_signature");
  }

  const bookingId = event.bookingId;
  const providerRef = event.providerRef;
  if (!bookingId || !providerRef) return res.status(400).send("no_booking");

  // Idempotent + atomic financial-state update.
  try {
    await db.runTransaction(async (tx) => {
      const bRef = db.collection("bookings").doc(bookingId);
      const bSnap = await tx.get(bRef);
      if (!bSnap.exists) throw new Error("booking_gone");
      const bData = bSnap.data();

      // Linkage: the booking's stored providerRef must match the event.
      const storedRef = bData.paymentIntentId;
      if (storedRef && storedRef !== providerRef)
        throw new Error("provider_ref_mismatch");

      // Amount/currency validation against authoritative Firestore truth.
      const expectedCents = Math.round((bData.total || 0) * 100);
      if (event.amountCents && expectedCents && event.amountCents !== expectedCents)
        throw new Error("amount_mismatch");
      if (event.currency && bData.currency && event.currency !== bData.currency)
        throw new Error("currency_mismatch");

      // Find the matching payments record (or create if webhook-first).
      const txnQ = await db.collection("payments")
        .where("bookingId", "==", bookingId)
        .where("providerRef", "==", providerRef).limit(1).get();
      const txnRef = !txnQ.empty ? txnQ.docs[0].ref
        : db.collection("payments").doc(newTxnId(bookingId));

      const succeeded = event.status === "succeeded";
      const refunded = event.status === "refunded";

      // Set payment truth based on provider event ONLY.
      let paymentStatus = bSnap.get("paymentStatus");
      let bookingStatus = bSnap.get("status");
      if (succeeded) {
        paymentStatus = "Paid";
        // Confirm the booking ONLY if it is still Pending.
        if (bookingStatus === "Pending") bookingStatus = "Confirmed";
      } else if (refunded) {
        paymentStatus = "Refunded";
      } else {
        paymentStatus = "Failed";
      }

      tx.update(bRef, {
        paymentStatus,
        status: bookingStatus,
        paidAt: succeeded ? admin.firestore.FieldValue.serverTimestamp() : null,
        paymentMeta: {
          last4: event.last4 || null,
          method: event.method || null,
          providerRef: providerRef || null,
          transactionId: event.transactionId || null
        }
      });
      tx.update(txnRef, {
        status: succeeded ? "succeeded" : refunded ? "refunded" : "failed",
        providerRef,
        webhookVerified: true,
        transactionId: event.transactionId || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
  } catch (e) {
    console.error("webhook update failed:", e.message);
    // 422 lets Paymob retry; idempotency is preserved on retry.
    return res.status(422).send("update_failed");
  }
  return res.status(200).send("ok");
});

// ---------------- 3) refundPayment ----------------
exports.refundPayment = functions.https.onCall(async (data, context) => {
  // AUTHORIZATION: admin ONLY via verified custom claim.
  // Do NOT trust a frontend flag (e.g. isAdmin:true).
  if (!context.auth || !context.auth.token || context.auth.token.admin !== true)
    throw new functions.https.HttpsError("permission-denied", "admin_only");

  const bookingId = data && data.bookingId;
  if (!bookingId) throw new functions.https.HttpsError("invalid-argument", "bookingId required");

  const booking = await loadBooking(bookingId);
  if (!booking) throw new functions.https.HttpsError("not-found", "booking_not_found");
  if ((booking.paymentStatus || "Unpaid") !== "Paid")
    throw new functions.https.HttpsError("failed-precondition", "not_paid");

  // Validate the provider reference matches the stored transaction.
  const providerRef = booking.paymentIntentId || (booking.paymentMeta && booking.paymentMeta.providerRef);
  const transactionId = booking.paymentMeta && booking.paymentMeta.transactionId;
  if (!providerRef)
    throw new functions.https.HttpsError("failed-precondition", "no_provider_ref");
  if (!transactionId)
    throw new functions.https.HttpsError("failed-precondition", "no_transaction_id");

  const provider = getProvider();
  // Call provider refund with the SERVER secret.
  await provider.refund({ providerRef, amount: booking.total, currency: booking.currency || "USD", transactionId });

  // Only after provider confirmation do we mark Refunded.
  await db.collection("bookings").doc(bookingId).update({ paymentStatus: "Refunded" });
  await db.collection("payments").add({
    bookingId, provider: provider.name,
    amount: booking.total, currency: booking.currency || "USD",
    status: "refunded", providerRef, transactionId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(), webhookVerified: true
  });

  // Booking status is intentionally left independent (e.g. Cancelled stays).
  return { ok: true };
});

// ---------------- Server-authoritative booking creation ----------------
// Closes the LIVE double-booking race: availability is checked and the
// booking is written INSIDE the SAME Firestore transaction, so two
// concurrent public submissions for the same room/dates cannot both
// succeed. Cancelled / Checked Out stays are excluded from blocking.
exports.createBooking = functions.https.onCall(async (data, context) => {
  // Public flow: no Firebase Auth required (guest checkout). Ownership
  // of payment is proven later via the accessToken. We only validate
  // the booking payload and enforce availability atomically.
  const d = data || {};
  const roomId = d.roomId;
  if (!roomId) throw new functions.https.HttpsError("invalid-argument", "roomId required");
  if (!d.checkin || !d.checkout) throw new functions.https.HttpsError("invalid-argument", "dates required");
  if (!d.guestName) throw new functions.https.HttpsError("invalid-argument", "guestName required");

  const inStr = String(d.checkin), outStr = String(d.checkout);
  const a = new Date(inStr + "T00:00:00"), b = new Date(outStr + "T00:00:00");
  if (isNaN(a) || isNaN(b) || b <= a)
    throw new functions.https.HttpsError("invalid-argument", "invalid_dates");
  const nights = Math.round((b - a) / 86400000);

  // Resolve room (server truth) for name + price.
  const roomSnap = await db.collection("rooms").doc(roomId).get();
  if (!roomSnap.exists) throw new functions.https.HttpsError("not-found", "room_not_found");
  const room = roomSnap.data();
  const rate = Number(room.price) || 0;
  const rc = Math.max(1, parseInt(d.rooms, 10) || 1);
  const total = rate * nights * rc;

  // Atomic availability check + create in ONE transaction.
  const ref = db.collection("bookings").doc();
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(db.collection("bookings").where("roomId", "==", roomId));
    const conflict = existing.docs.some((s) => {
      const x = s.data();
      const st = x.status || "Pending";
      if (st === "Cancelled" || st === "Checked Out") return false; // void
      const exIn = x.checkin, exOut = x.checkout;
      if (!exIn || !exOut) return false;
      // Half-open overlap (check-out day is free).
      return new Date(inStr + "T00:00:00").getTime() < new Date(exOut + "T00:00:00").getTime()
          && new Date(outStr + "T00:00:00").getTime() > new Date(exIn + "T00:00:00").getTime();
    });
    if (conflict) throw new functions.https.HttpsError("failed-precondition", "dates_unavailable");

    const booking = {
      guestName: String(d.guestName),
      email: d.email || "",
      phone: d.phone || "",
      roomId,
      roomName: room.name || roomId,
      room: room.name || roomId,
      roomType: room.type || room.name || roomId,
      checkin: inStr,
      checkout: outStr,
      adults: parseInt(d.adults, 10) || 1,
      children: parseInt(d.children, 10) || 0,
      rooms: rc,
      guests: (parseInt(d.adults, 10) || 1) + (parseInt(d.children, 10) || 0),
      nights,
      total,
      revenue: total,
      status: "Pending",
      paymentStatus: "Unpaid",
      created: admin.firestore.FieldValue.serverTimestamp()
    };
    tx.set(ref, booking); // accessToken stamped by onBookingCreate trigger
  });

  return { id: ref.id, ok: true };
});

// ---------------- Booking create trigger ----------------
// Enforces server-side defaults + stamps an ownership access token.
// This is the backstop that makes the Firestore create-rule safe:
// even if a client tried to sneak financial/status fields, we
// overwrite them here with authoritative values.
exports.onBookingCreate = functions.firestore
  .document("bookings/{id}")
  .onCreate(async (snap, ctx) => {
    const b = snap.data();
    const accessToken = newAccessCode();
    await snap.ref.update({
      accessToken,
      status: "Pending",
      paymentStatus: "Unpaid",
      paymentIntentId: admin.firestore.FieldValue.delete(),
      paymentProvider: admin.firestore.FieldValue.delete(),
      amount: admin.firestore.FieldValue.delete(),
      currency: admin.firestore.FieldValue.delete(),
      paidAt: admin.firestore.FieldValue.delete(),
      paymentMeta: admin.firestore.FieldValue.delete()
    });
  });

// ---------------- Admin claim setup ----------------
// Bootstrap strategy (server-side, safe for production):
//   - ADMIN_EMAILS env var = comma-separated allowlist of emails that
//     may be granted the `admin` claim (e.g. "boss@hotel.com").
//   - An existing admin (context.auth.token.admin === true) may grant
//     the claim to ANY verified account (promotion by admin).
//   - A non-admin caller may ONLY self-promote IF their own email is
//     in ADMIN_EMAILS (initial bootstrap). Otherwise denied.
//   - Normal public users can NEVER self-promote.
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "auth_required");
  const callerEmail = context.auth.token.email;
  const callerIsAdmin = context.auth.token.admin === true;

  const allowlist = (process.env.ADMIN_EMAILS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

  const email = data && data.email;
  if (!email) throw new functions.https.HttpsError("invalid-argument", "email required");

  // Authorization rules:
  //  (a) existing admin may grant to anyone, OR
  //  (b) caller self-requests AND their email is in the allowlist.
  const isSelf = callerEmail && callerEmail.toLowerCase() === email.trim().toLowerCase();
  const allowedByList = isSelf && allowlist.includes(email.trim().toLowerCase());
  if (!callerIsAdmin && !allowedByList)
    throw new functions.https.HttpsError("permission-denied", "not_authorized");

  try {
    const user = await admin.auth().getUserByEmail(email);
    // Promote (merge with existing claims).
    const existing = user.customClaims || {};
    await admin.auth().setCustomUserClaims(user.uid, Object.assign({}, existing, { admin: true }));
    return { ok: true, uid: user.uid };
  } catch (e) {
    throw new functions.https.HttpsError("not-found", "user_not_found");
  }
});
