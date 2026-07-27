/* =========================================================
   src/services/schedulerService.js — Automatic booking lifecycle.
   ---------------------------------------------------------
   Runs periodically (configurable interval) and performs two
   idempotent sweeps:

   A) Cancel expired unpaid PENDING bookings.
      Criteria: status=PENDING AND paymentStatus=UNPAID
                AND createdAt + BOOKING_PAYMENT_EXPIRY_MINUTES < now
      Effect:   status→CANCELLED, cancelReason set, room freed.

   B) Mark no-show confirmed paid bookings.
      Criteria: status=CONFIRMED AND paymentStatus=PAID
                AND checkin + NO_SHOW_GRACE_HOURS < now
      Effect:   status→NO_SHOW (payment preserved).

   Both transitions are safe to run repeatedly — only bookings
   still matching the source criteria will be updated.
   ========================================================= */
const prisma = require("../config/database");
const ENV = require("../config/env");

let timer = null;
let running = false;

/* ── A. Expire unpaid pending bookings ────────────────── */
async function cancelExpiredBookings(now) {
  const nowMs = (now instanceof Date ? now : new Date()).getTime();
  const expiryMs = ENV.BOOKING_PAYMENT_EXPIRY_MINUTES * 60 * 1000;
  const cutoff = new Date(nowMs - expiryMs);

  const expired = await prisma.booking.findMany({
    where: {
      status: "PENDING",
      paymentStatus: "UNPAID",
      createdAt: { lt: cutoff }
    },
    select: { id: true, guestName: true, roomId: true, createdAt: true }
  });

  if (!expired.length) return 0;

  let cancelled = 0;
  for (const b of expired) {
    try {
      const reason = "Booking automatically cancelled because payment was not completed before the "
        + ENV.BOOKING_PAYMENT_EXPIRY_MINUTES + "-minute expiry window.";

      await prisma.booking.update({
        where: { id: b.id },
        data: { status: "CANCELLED", cancelReason: reason, updatedAt: new Date() }
      });

      console.log(JSON.stringify({
        type: "scheduler",
        event: "booking_expired",
        bookingId: b.id,
        guestName: b.guestName,
        roomId: b.roomId
      }));

      cancelled++;
    } catch (err) {
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
    expiryMinutes: ENV.BOOKING_PAYMENT_EXPIRY_MINUTES,
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
