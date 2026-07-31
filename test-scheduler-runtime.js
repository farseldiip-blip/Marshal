const prisma = require("./backend/src/config/database");
const ENV = require("./backend/src/config/env");
const { createBooking, checkAvailability } = require("./backend/src/services/bookingService");
const { createIntent, confirmDemoPayment } = require("./backend/src/services/paymentService");
const { cancelExpiredBookings, markNoShows } = require("./backend/src/services/schedulerService");

function dateStr(offsetDays) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function die(msg) {
  console.error(JSON.stringify({ test: "scheduler-runtime", fatal: msg }));
  process.exit(1);
}

(async () => {
  const room = await prisma.room.findFirst({ where: { isActive: true }, orderBy: { id: "asc" } });
  if (!room) die("no active room found");

  const before = {
    pendingUnpaid: await prisma.booking.count({ where: { status: "PENDING", paymentStatus: "UNPAID" } }),
    confirmedPaid: await prisma.booking.count({ where: { status: "CONFIRMED", paymentStatus: "PAID" } }),
    cancelled: await prisma.booking.count({ where: { status: "CANCELLED" } })
  };

  const stamp = Date.now();
  const created = [];

  const seed = await createBooking({
    guestName: "SCHED RUNTIME EXPIRED " + stamp,
    email: "schedruntimeexpired" + stamp + "@example.com",
    phone: "+201000000041",
    roomId: room.id,
    checkin: dateStr(60),
    checkout: dateStr(64),
    adults: 2,
    children: 0,
    rooms: 1
  }, null);
  created.push(seed.id);
  await prisma.booking.update({
    where: { id: seed.id },
    data: { createdAt: new Date(Date.now() - (ENV.BOOKING_PAYMENT_EXPIRY_MINUTES + 30) * 60 * 1000) }
  });

  const fresh = await createBooking({
    guestName: "SCHED RUNTIME FRESH " + stamp,
    email: "schedruntimefresh" + stamp + "@example.com",
    phone: "+201000000042",
    roomId: room.id,
    checkin: dateStr(70),
    checkout: dateStr(73),
    adults: 2,
    children: 0,
    rooms: 1
  }, null);
  created.push(fresh.id);

  const paid = await createBooking({
    guestName: "SCHED RUNTIME PAID " + stamp,
    email: "schedruntimepaid" + stamp + "@example.com",
    phone: "+201000000043",
    roomId: room.id,
    checkin: dateStr(80),
    checkout: dateStr(83),
    adults: 2,
    children: 0,
    rooms: 1
  }, null);
  created.push(paid.id);
  const intent = await createIntent({ bookingId: paid.id, accessToken: paid.accessToken });
  await confirmDemoPayment({ bookingId: paid.id, txnId: intent.txnId, accessToken: paid.accessToken });

  const availBefore = await checkAvailability({ roomId: room.id, checkIn: dateStr(60), checkOut: dateStr(64) });
  const cancelled = await cancelExpiredBookings(new Date());

  const seedAfter = await prisma.booking.findUnique({ where: { id: seed.id } });
  const freshAfter = await prisma.booking.findUnique({ where: { id: fresh.id } });
  const paidAfter = await prisma.booking.findUnique({ where: { id: paid.id } });
  const availAfter = await checkAvailability({ roomId: room.id, checkIn: dateStr(60), checkOut: dateStr(64) });

  const noShows = await markNoShows(new Date());
  const paidAfterNoShow = await prisma.booking.findUnique({ where: { id: paid.id } });

  const after = {
    pendingUnpaid: await prisma.booking.count({ where: { status: "PENDING", paymentStatus: "UNPAID" } }),
    confirmedPaid: await prisma.booking.count({ where: { status: "CONFIRMED", paymentStatus: "PAID" } }),
    cancelled: await prisma.booking.count({ where: { status: "CANCELLED" } })
  };

  const checks = {
    expiredCancelled: seedAfter.status === "CANCELLED" && !!seedAfter.cancelReason && seedAfter.cancelReason.includes("automatically cancelled"),
    roomFreed: availAfter.availableUnits === availBefore.availableUnits + 1,
    freshUntouched: freshAfter.status === "PENDING" && freshAfter.paymentStatus === "UNPAID",
    paidUntouched: paidAfter.status === "CONFIRMED" && paidAfter.paymentStatus === "PAID",
    paidUntouchedByNoShow: paidAfterNoShow.status === "CONFIRMED" && paidAfterNoShow.paymentStatus === "PAID",
    noCollateralCancels: after.cancelled - before.cancelled === 1,
    pendingDeltaExact: after.pendingUnpaid - before.pendingUnpaid === 1,
    confirmedDeltaExact: after.confirmedPaid - before.confirmedPaid === 1
  };
  const pass = Object.values(checks).every(Boolean);

  console.log(JSON.stringify({
    test: "scheduler-runtime",
    pass,
    checks,
    detail: {
      cancelledExpired: cancelled,
      markedNoShow: noShows,
      expiredStatus: seedAfter.status,
      cancelReason: seedAfter.cancelReason,
      freshStatus: freshAfter.status,
      paidStatus: paidAfter.status,
      availableUnitsBefore: availBefore.availableUnits,
      availableUnitsAfter: availAfter.availableUnits,
      rowsBefore: before,
      rowsAfter: after
    }
  }, null, 2));

  for (const id of created) {
    await prisma.payment.deleteMany({ where: { bookingId: id } });
    await prisma.booking.delete({ where: { id } });
  }

  await prisma.$disconnect();
  process.exit(pass ? 0 : 1);
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
