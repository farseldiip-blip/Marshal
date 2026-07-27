/* =========================================================
   src/services/adminService.js — Admin CRUD for all entities.
   ---------------------------------------------------------
   SECURITY:
   - Input is pre-validated by Zod schemas (routes layer).
   - Sensitive operations are logged.
   - Booking updates restricted to safe fields.
   - Password hashes never returned.
   ========================================================= */
const prisma = require("../config/database");
const { NotFoundError, ConflictError } = require("../utils/errors");
const { newTxnId } = require("../utils/token");
const { getCurrency } = require("./paymentService");

// ── Rooms ───────────────────────────────────────────────
async function listRooms() {
  return prisma.room.findMany({ orderBy: { createdAt: "asc" } });
}

async function listRoomTypes() {
  const rows = await prisma.room.findMany({ select: { type: true }, distinct: ["type"] });
  return rows.map(function (r) { return r.type; }).filter(Boolean).sort();
}

async function getRoom(id) {
  const r = await prisma.room.findUnique({ where: { id } });
  if (!r) throw new NotFoundError("room_not_found");
  return r;
}

async function createRoom(data) {
  const room = await prisma.room.create({ data });
  console.log(JSON.stringify({ type: "admin", event: "room_created", roomId: room.id, name: room.name }));
  return room;
}

async function updateRoom(id, data) {
  await getRoom(id);
  const room = await prisma.room.update({ where: { id }, data });
  console.log(JSON.stringify({ type: "admin", event: "room_updated", roomId: id }));
  return room;
}

async function deleteRoom(id) {
  const room = await getRoom(id);
  const activeBookingCount = await prisma.booking.count({
    where: { roomId: id, status: { not: "CANCELLED" } }
  });
  if (activeBookingCount > 0) {
    throw new ConflictError("This room has active bookings and cannot be permanently deleted. Archive it instead.");
  }
  // Null out CANCELLED booking references before deletion.
  await prisma.booking.updateMany({
    where: { roomId: id, status: "CANCELLED" },
    data: { roomId: null }
  });
  console.log(JSON.stringify({ type: "admin", event: "room_deleted", roomId: id, name: room.name }));
  return prisma.room.delete({ where: { id } });
}

// ── Bookings ────────────────────────────────────────────
// Only these fields can be updated by admin.
const BOOKING_ALLOWED_UPDATE = new Set([
  "guestName", "email", "phone", "status", "paymentStatus",
  "adults", "children", "rooms"
]);

async function listBookings() {
  return prisma.booking.findMany({
    orderBy: { createdAt: "desc" },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 1, select: { provider: true, status: true } } }
  });
}

async function getBooking(id) {
  const b = await prisma.booking.findUnique({ where: { id } });
  if (!b) throw new NotFoundError("booking_not_found");
  return b;
}

async function updateBooking(id, data) {
  const before = await getBooking(id);
  console.log("[PAYMENT UPDATE] BEFORE:", JSON.stringify({ id: before.id, total: before.total, paymentStatus: before.paymentStatus, status: before.status, updatedAt: before.updatedAt }));
  console.log("[PAYMENT UPDATE] incoming data:", JSON.stringify(data));
  // Only pass allowed fields to Prisma.
  const clean = {};
  for (const k of Object.keys(data)) {
    if (BOOKING_ALLOWED_UPDATE.has(k)) clean[k] = data[k];
  }
  clean.updatedAt = new Date();

  // Manual "Mark as Paid" — create Payment record atomically.
  const markingPaid = clean.paymentStatus === "PAID" && before.paymentStatus !== "PAID";
  if (markingPaid) {
    // Prevent duplicate: if a successful Payment already exists, block.
    const existingPaid = await prisma.payment.findFirst({
      where: { bookingId: id, status: "PAID" },
      orderBy: { createdAt: "desc" }
    });
    if (existingPaid) {
      throw new ConflictError("booking_already_has_successful_payment");
    }

    const currency = await getCurrency();
    const now = new Date();
    if (before.status === "PENDING") clean.status = "CONFIRMED";

    console.log("[PAYMENT UPDATE] creating manual Payment record:", JSON.stringify({ bookingId: id, amount: before.total, currency }));
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          id: newTxnId(id),
          bookingId: id,
          provider: "manual",
          amount: before.total,
          currency,
          status: "PAID",
          webhookVerified: false,
          paidAt: now,
          metadata: { method: "manual_admin", reason: "Marked as paid by administrator" }
        }
      });
      await tx.booking.update({ where: { id }, data: clean });
    });

    const after = await getBooking(id);
    console.log("[PAYMENT UPDATE] AFTER:", JSON.stringify({ id: after.id, total: after.total, paymentStatus: after.paymentStatus, status: after.status }));
    return after;
  }

  console.log("[PAYMENT UPDATE] clean payload for Prisma:", JSON.stringify(clean));
  const booking = await prisma.booking.update({ where: { id }, data: clean });
  console.log("[PAYMENT UPDATE] AFTER:", JSON.stringify({ id: booking.id, total: booking.total, paymentStatus: booking.paymentStatus, status: booking.status, updatedAt: booking.updatedAt }));
  return booking;
}

async function deleteBooking(id) {
  await getBooking(id);
  console.log(JSON.stringify({ type: "admin", event: "booking_deleted", bookingId: id }));
  return prisma.booking.delete({ where: { id } });
}

// ── Menu ────────────────────────────────────────────────
async function listMenu() { return prisma.menuItem.findMany({ orderBy: { sortOrder: "asc" } }); }
async function createMenuItem(data) { return prisma.menuItem.create({ data }); }
async function updateMenuItem(id, data) {
  await prisma.menuItem.findUniqueOrThrow({ where: { id } });
  return prisma.menuItem.update({ where: { id }, data });
}
async function deleteMenuItem(id) { return prisma.menuItem.delete({ where: { id } }); }

// ── Gallery ─────────────────────────────────────────────
async function listGallery() { return prisma.galleryItem.findMany({ orderBy: { sortOrder: "asc" } }); }
async function createGalleryItem(data) { return prisma.galleryItem.create({ data }); }
async function updateGalleryItem(id, data) {
  await prisma.galleryItem.findUniqueOrThrow({ where: { id } });
  return prisma.galleryItem.update({ where: { id }, data });
}
async function deleteGalleryItem(id) { return prisma.galleryItem.delete({ where: { id } }); }

// ── Reviews ─────────────────────────────────────────────
async function listReviews(filter) {
  const where = {};
  if (filter && filter !== "ALL") {
    where.status = filter;
  }
  return prisma.review.findMany({ where, orderBy: { createdAt: "desc" } });
}

async function createReview(data) {
  return prisma.review.create({ data });
}

async function updateReview(id, data) {
  await prisma.review.findUniqueOrThrow({ where: { id } });
  return prisma.review.update({ where: { id }, data });
}

async function updateReviewStatus(id, status) {
  const r = await prisma.review.findUniqueOrThrow({ where: { id } });
  const data = { status };
  if (status === "PUBLISHED") data.approved = true;
  else if (status === "REJECTED") data.approved = false;
  else data.approved = false;
  return prisma.review.update({ where: { id }, data });
}

async function deleteReview(id) {
  await prisma.review.findUniqueOrThrow({ where: { id } });
  return prisma.review.delete({ where: { id } });
}

// ── Amenities ───────────────────────────────────────────
async function listAmenities() { return prisma.amenity.findMany({ orderBy: { sortOrder: "asc" } }); }
async function createAmenity(data) { return prisma.amenity.create({ data }); }
async function updateAmenity(id, data) {
  await prisma.amenity.findUniqueOrThrow({ where: { id } });
  return prisma.amenity.update({ where: { id }, data });
}
async function deleteAmenity(id) { return prisma.amenity.delete({ where: { id } }); }

// ── Dashboard Stats ─────────────────────────────────────
async function dashboardStats() {
  // Total Revenue = sum of booking totals where paymentStatus is PAID.
  // Only successfully completed payments contribute to revenue.
  // The Prisma PaymentStatus enum is UPPERCASE: PAID, UNPAID, PENDING, FAILED, REFUNDED.
  const allBookings = await prisma.booking.findMany({
    select: { id: true, total: true, paymentStatus: true, status: true, guestName: true }
  });
  console.log("[REVENUE STATS] ALL BOOKINGS:", JSON.stringify(allBookings.map(b => ({ id: b.id, guest: b.guestName, total: b.total, paymentStatus: b.paymentStatus, status: b.status }))));

  const revenueResult = await prisma.booking.aggregate({
    _sum: { total: true },
    where: { paymentStatus: "PAID" }
  });
  const totalRevenue = revenueResult._sum.total || 0;

  // Diagnostic: count bookings by paymentStatus
  const statusCounts = await prisma.booking.groupBy({
    by: ["paymentStatus"],
    _count: { id: true },
    _sum: { total: true }
  });
  console.log("[REVENUE STATS] paymentStatus breakdown:", statusCounts.map(
    s => `${s.paymentStatus}: ${s._count.id} bookings, sum=${s._sum.total || 0}`
  ).join(", "));
  console.log("[REVENUE STATS] totalRevenue (PAID only):", totalRevenue);

  return { totalRevenue };
}

// ── Settings ────────────────────────────────────────────
async function listSettings() { return prisma.hotelSetting.findMany(); }
async function getSetting(key) {
  const s = await prisma.hotelSetting.findUnique({ where: { key } });
  if (!s) throw new NotFoundError("setting_not_found");
  return s;
}
async function setSetting(key, value, label) {
  return prisma.hotelSetting.upsert({
    where: { key },
    update: { value, label, updatedAt: new Date() },
    create: { key, value, label }
  });
}
async function deleteSetting(key) { return prisma.hotelSetting.delete({ where: { key } }); }

module.exports = {
  listRooms, listRoomTypes, getRoom, createRoom, updateRoom, deleteRoom,
  listBookings, getBooking, updateBooking, deleteBooking,
  dashboardStats,
  listMenu, createMenuItem, updateMenuItem, deleteMenuItem,
  listGallery, createGalleryItem, updateGalleryItem, deleteGalleryItem,
  listReviews, createReview, updateReview, updateReviewStatus, deleteReview,
  listAmenities, createAmenity, updateAmenity, deleteAmenity,
  listSettings, getSetting, setSetting, deleteSetting
};
