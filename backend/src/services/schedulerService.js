/* =========================================================
   src/services/schedulerService.js — Automatic booking lifecycle.
   ---------------------------------------------------------
   Runs periodically (configurable interval) and performs two
   idempotent sweeps:

   A) Cancel expired unpaid PENDING bookings.
      Criteria: status=PENDING AND paymentStatus=UNPAID
                AND createdAt + BOOKING_PAYMENT_TIMEOUT_MINUTES < now
      Effect:   status→CANCELLED, cancelReason="PAYMENT_TIMEOUT", room freed.

   B) Mark no-show confirmed paid bookings.
      Criteria: status=CONFIRMED AND paymentStatus=PAID
                AND checkin + NO_SHOW_GRACE_HOURS < now
      Effect:   status→NO_SHOW (payment preserved).

   Both transitions are safe to run repeatedly — only bookings
   still matching the source criteria will be updated (atomic
   updateMany re-checks the status/paymentStatus predicates, so a
   booking PAID concurrently is never cancelled).
   ========================================================= */
const prisma = require("../config/database");
const ENV = require("../config/env");

let timer = null;
let running = false;

/* ── A. Expire unpaid pending bookings ────────────────── */
async function cancelExpiredBookings(now) {
  const nowMs = (now instanceof Date ? now : new Date()).getTime();
  const expiryMs = ENV.BOOKING_PAYMENT_TIMEOUT_MINUTES * 60 * 1000;
  const cutoff = new Date(nowMs - expiryMs);

  const expired = await prisma.booking.findMany({
    where: {
      status: "PENDING",
      paymentStatus: "UNPAID",
      createdAt: { lt: cutoff }
    },
    select: { id: true, guestName: true, roomId: true, createdAt: true }
  });

  console.log("[BOOKING EXPIRY] Found " + expired.length + " expired unpaid bookings");
  if (!expired.length) return 0;

  let cancelled = 0;
  for (const b of expired) {
    try {
      // Atomic + idempotent: only re-checks still-PENDING & still-UNPAID rows.
      // If a payment is confirmed concurrently, updateMany matches 0 rows and
      // the booking is left untouched.
      const res = await prisma.booking.updateMany({
        where: {
          id: b.id,
          status: "PENDING",
          paymentStatus: "UNPAID",
          createdAt: { lt: cutoff }
        },
        data: { status: "CANCELLED", cancelReason: "PAYMENT_TIMEOUT", updatedAt: new Date() }
      });

      if (res.count === 0) continue; // booking changed since we read it

      console.log("[BOOKING EXPIRY] Cancelled booking " + b.id);
      console.log(JSON.stringify({
        type: "scheduler",
        event: "booking_expired",
        bookingId: b.id,
        guestName: b.guestName,
        roomId: b.roomId
      }));

      cancelled++;
    } catch (err) {
      console.error("[BOOKING EXPIRY] Error cancelling booking " + b.id + ": " + err.message);
      console.error(JSON.stringify({
        type: "scheduler",
        event: "expire_error",
        bookingId: b.id,
        error: err.message
      }));
    }
  }

  return cancelled;
}

/* ── B. Mark no-show bookings ────────────────────────── */
async function markNoShows(now) {
  const nowMs = (now instanceof Date ? now : new Date()).getTime();
  const graceMs = ENV.NO_SHOW_GRACE_HOURS * 60 * 60 * 1000;

  // Find confirmed paid bookings whose check-in date + grace has passed.
  // checkin is stored as YYYY-MM-DD string; compute the threshold date.
  const graceDate = new Date(nowMs - graceMs);
  const graceStr = graceDate.toISOString().slice(0, 10); // YYYY-MM-DD

  const noShows = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      paymentStatus: "PAID",
      checkin: { lt: graceStr }
    },
    select: { id: true, guestName: true, roomId: true, checkin: true }
  });

  if (!noShows.length) return 0;

  let marked = 0;
  for (const b of noShows) {
    try {
      const reason = "No-show: guest did not check in within "
        + ENV.NO_SHOW_GRACE_HOURS + " hours of the scheduled check-in date.";

      await prisma.booking.update({
        where: { id: b.id },
        data: { status: "NO_SHOW", cancelReason: reason, updatedAt: new Date() }
      });

      console.log(JSON.stringify({
        type: "scheduler",
        event: "booking_no_show",
        bookingId: b.id,
        guestName: b.guestName,
        roomId: b.roomId,
        checkin: b.checkin
      }));

      marked++;
    } catch (err) {
      console.error(JSON.stringify({
        type: "scheduler",
        event: "no_show_error",
        bookingId: b.id,
        error: err.message
      }));
    }
  }

  return marked;
}

/* ── Combined sweep (idempotent) ─────────────────────── */
async function runSweep() {
  if (running) return { skipped: true };
  running = true;
  try {
    const cancelled = await cancelExpiredBookings();
    const noShows = await markNoShows();
    if (cancelled || noShows) {
      console.log(JSON.stringify({
        type: "scheduler",
        event: "sweep_complete",
        cancelledExpired: cancelled,
        markedNoShow: noShows
      }));
    }
    console.log("[BOOKING EXPIRY] Completed successfully");
    return { cancelledExpired: cancelled, markedNoShow: noShows };
  } finally {
    running = false;
  }
}

/* ── Timer lifecycle ─────────────────────────────────── */
function start() {
  if (timer) return;
  const interval = ENV.SCHEDULER_INTERVAL_MS;
  console.log(JSON.stringify({
    type: "scheduler",
    event: "started",
    intervalMs: interval,
    timeoutMinutes: ENV.BOOKING_PAYMENT_TIMEOUT_MINUTES,
    noShowGraceHours: ENV.NO_SHOW_GRACE_HOURS
  }));

  // Run once immediately on startup, then on interval.
  runSweep().catch(function (err) {
    console.error(JSON.stringify({ type: "scheduler", event: "startup_sweep_error", error: err.message }));
  });

  timer = setInterval(function () {
    runSweep().catch(function (err) {
      console.error(JSON.stringify({ type: "scheduler", event: "sweep_error", error: err.message }));
    });
  }, interval);

  // Allow the process to exit even if the timer is running.
  if (timer.unref) timer.unref();
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { start, stop, runSweep, cancelExpiredBookings, markNoShows };
