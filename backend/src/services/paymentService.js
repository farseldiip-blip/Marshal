/* =========================================================
   src/services/paymentService.js — Payment authority.
   ---------------------------------------------------------
   RULES ENFORCED HERE (frontend never does these):
   - Provider secrets read from env ONLY.
   - paymentStatus "Paid" / booking "Confirmed" set HERE (webhook),
     never by the client.
   - Webhook signature verified before any mutation.
   - Idempotent updates via PostgreSQL transaction.
   ========================================================= */
const prisma = require("../config/database");
const ENV = require("../config/env");
const paymob = require("../lib/paymob");
const { newTxnId } = require("../utils/token");
const { NotFoundError, ConflictError, ValidationError, ForbiddenError } = require("../utils/errors");

// Authoritative currency — read from HotelSetting, never from frontend.
// Resolution order matches site-settings.js normalizeSettings():
//   1. Standalone HotelSetting key "currency"
//   2. Parsed from HotelSetting key "hotel_info" JSON
//   3. Hard fallback "USD"
async function getCurrency() {
  const row = await prisma.hotelSetting.findUnique({ where: { key: "currency" } });
  if (row && row.value) return String(row.value).trim().toUpperCase();

  const hotelInfoRow = await prisma.hotelSetting.findUnique({ where: { key: "hotel_info" } });
  if (hotelInfoRow && hotelInfoRow.value) {
    try {
      const parsed = JSON.parse(hotelInfoRow.value);
      if (parsed && parsed.currency) return String(parsed.currency).trim().toUpperCase();
    } catch (_) { /* ignore parse errors */ }
  }

  return "USD";
}

// Eligibility for payment: active, unsettled booking.
function isEligibleForPayment(b) {
  if (!b) return false;
  const st = b.status || "PENDING";
  if (st === "CANCELLED" || st === "CHECKED_OUT") return false;
  const ps = b.paymentStatus || "UNPAID";
  if (ps === "PAID" || ps === "REFUNDED") return false;
  return true;
}

// 1) Create payment intent (hosted checkout) — routes to demo or paymob.
async function createIntent({ bookingId, accessToken }) {
  if (ENV.PAYMENT_MODE === "demo") {
    return createDemoIntent({ bookingId, accessToken });
  }
  return createPaymobIntent({ bookingId, accessToken });
}

// 1a) Demo mode: create a pending payment and return a local checkout URL.
async function createDemoIntent({ bookingId, accessToken }) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new NotFoundError("booking_not_found");
  if (booking.accessToken && accessToken !== booking.accessToken) {
    throw new ForbiddenError("ownership_unverified");
  }
  if (!isEligibleForPayment(booking)) throw new ConflictError("not_eligible_for_payment");
  if (typeof booking.total !== "number" || booking.total <= 0) throw new ValidationError("booking_total_invalid");

  const currency = await getCurrency();

  const open = await prisma.payment.findFirst({
    where: { bookingId, status: "PENDING" },
    orderBy: { createdAt: "desc" }
  });
  let txnId;
  if (open) {
    txnId = open.id;
  } else {
    txnId = newTxnId(bookingId);
  }

  await prisma.payment.upsert({
    where: { id: txnId },
    update: { provider: "demo", amount: booking.total, currency, status: "PENDING", updatedAt: new Date() },
    create: { id: txnId, bookingId, provider: "demo", amount: booking.total, currency, status: "PENDING" }
  });

  await prisma.booking.update({
    where: { id: bookingId },
    data: { paymentStatus: "PENDING", updatedAt: new Date() }
  });

  const frontendBase = (ENV.FRONTEND_ORIGIN || "http://localhost:5500").split(",")[0];
  const checkoutUrl = `${frontendBase}/demo-checkout.html?bookingId=${bookingId}&accessToken=${encodeURIComponent(accessToken)}&txnId=${txnId}`;

  return { ok: true, checkoutUrl, clientToken: null, txnId };
}

// 1b) Confirm demo payment — idempotent, atomic.
async function confirmDemoPayment({ bookingId, txnId, accessToken }) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError("booking_not_found");
    if (booking.accessToken && accessToken !== booking.accessToken) {
      throw new ForbiddenError("ownership_unverified");
    }

    if (booking.paymentStatus === "PAID") {
      const existing = await tx.payment.findFirst({ where: { bookingId, status: "PAID" }, orderBy: { createdAt: "desc" } });
      return { ok: true, alreadyPaid: true, txnId: existing ? existing.id : txnId };
    }

    const payment = await tx.payment.findUnique({ where: { id: txnId } });
    if (!payment) throw new NotFoundError("payment_not_found");
    if (payment.bookingId !== bookingId) throw new ForbiddenError("payment_booking_mismatch");
    if (payment.status === "PAID") return { ok: true, alreadyPaid: true, txnId };

    await tx.payment.update({
      where: { id: txnId },
      data: { status: "PAID", paidAt: new Date(), webhookVerified: true, updatedAt: new Date() }
    });

    let bookingStatus = booking.status;
    if (bookingStatus === "PENDING") bookingStatus = "CONFIRMED";

    await tx.booking.update({
      where: { id: bookingId },
      data: { paymentStatus: "PAID", status: bookingStatus, updatedAt: new Date() }
    });

    return { ok: true, alreadyPaid: false, txnId };
  });
}

// 1c) Paymob intent (original logic, extracted).
async function createPaymobIntent({ bookingId, accessToken }) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new NotFoundError("booking_not_found");
  if (booking.accessToken && accessToken !== booking.accessToken) {
    throw new ForbiddenError("ownership_unverified");
  }
  if (!isEligibleForPayment(booking)) throw new ConflictError("not_eligible_for_payment");
  if (typeof booking.total !== "number" || booking.total <= 0) throw new ValidationError("booking_total_invalid");

  const currency = await getCurrency();

  const open = await prisma.payment.findFirst({
    where: { bookingId, status: { in: ["PENDING", "PAID"] } },
    orderBy: { createdAt: "desc" }
  });
  let txnId;
  if (open) {
    if (open.status === "PAID") throw new ConflictError("already_paid");
    txnId = open.id;
  } else {
    txnId = newTxnId(bookingId);
  }

  const session = await paymob.createSession({
    bookingId, amount: booking.total, currency, email: booking.email || "", booking
  });

  await prisma.payment.upsert({
    where: { id: txnId },
    update: {
      provider: paymob.name, providerReference: session.providerRef,
      amount: booking.total, currency, status: "PENDING", updatedAt: new Date()
    },
    create: {
      id: txnId, bookingId, provider: paymob.name, providerReference: session.providerRef,
      amount: booking.total, currency, status: "PENDING", metadata: session.metadata
    }
  });

  await prisma.booking.update({
    where: { id: bookingId },
    data: { paymentStatus: "PENDING", updatedAt: new Date() }
  });

  return { ok: true, checkoutUrl: session.checkoutUrl, clientToken: session.clientToken, txnId };
}

// 2) Webhook (idempotent + atomic). Paymob posts here.
async function handleWebhook(req) {
  const event = paymob.verifyWebhook(req); // throws on bad signature
  const bookingId = event.bookingId;
  const providerRef = event.providerRef;
  if (!bookingId || !providerRef) throw new ValidationError("no_booking");

  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError("booking_not_found");

    // Amount/currency validation against authoritative truth.
    const expectedCents = Math.round((booking.total || 0) * 100);
    if (event.amountCents && expectedCents && event.amountCents !== expectedCents) {
      throw new ValidationError("amount_mismatch");
    }
    const configuredCurrency = await getCurrency();
    if (event.currency && event.currency !== configuredCurrency) throw new ValidationError("currency_mismatch");

    const payment = await tx.payment.findFirst({
      where: { bookingId, providerReference: providerRef }
    });

    const succeeded = event.status === "succeeded";
    const refunded = event.status === "refunded";

    let paymentStatus = booking.paymentStatus;
    let bookingStatus = booking.status;
    if (succeeded) {
      paymentStatus = "PAID";
      if (bookingStatus === "PENDING") bookingStatus = "CONFIRMED";
    } else if (refunded) {
      paymentStatus = "REFUNDED";
    } else {
      paymentStatus = "FAILED";
    }

    await tx.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus,
        status: bookingStatus,
        updatedAt: new Date()
      }
    });

    const paymentData = {
      status: succeeded ? "PAID" : refunded ? "REFUNDED" : "FAILED",
      providerReference: providerRef,
      webhookVerified: true,
      transactionId: event.transactionId,
      paidAt: succeeded ? new Date() : null,
      updatedAt: new Date(),
      metadata: {
        last4: event.last4,
        method: event.method,
        providerRef,
        transactionId: event.transactionId
      }
    };
    if (payment) {
      await tx.payment.update({ where: { id: payment.id }, data: paymentData });
    } else {
      await tx.payment.create({
        data: Object.assign({ id: newTxnId(bookingId), bookingId, provider: paymob.name, amount: booking.total, currency: configuredCurrency }, paymentData)
      });
    }
  });

  return { ok: true };
}

// 3) Refund (admin-only, called from admin controller).
async function refundPayment(bookingId) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new NotFoundError("booking_not_found");
  if (booking.paymentStatus !== "PAID") throw new ConflictError("not_paid");

  const payment = await prisma.payment.findFirst({
    where: { bookingId, status: "PAID" },
    orderBy: { createdAt: "desc" }
  });
  if (!payment) throw new ConflictError("no_succeeded_payment");
  const transactionId = payment.transactionId;
  if (!transactionId) throw new ConflictError("no_transaction_id");

  const refundCurrency = payment.currency || await getCurrency();

  await paymob.refund({
    providerRef: payment.providerReference,
    amount: booking.total,
    currency: refundCurrency,
    transactionId
  });

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: bookingId }, data: { paymentStatus: "REFUNDED", updatedAt: new Date() } });
    await tx.payment.create({
      data: {
        id: newTxnId(bookingId),
        bookingId,
        provider: paymob.name,
        providerReference: payment.providerReference,
        transactionId,
        amount: booking.total,
        currency: refundCurrency,
        status: "REFUNDED",
        webhookVerified: true,
        metadata: { refunded: true }
      }
    });
  });

  return { ok: true };
}

module.exports = { createIntent, confirmDemoPayment, handleWebhook, refundPayment, isEligibleForPayment, getCurrency };
