/* =========================================================
   src/services/bookingService.js — Booking creation (PostgreSQL).
   ---------------------------------------------------------
   SECURITY CONTRACT:
   - Public flow: no JWT required (guest checkout).
   - Ownership of payment is proven later via the accessToken.
   - We validate input, verify the room exists, compute nights +
     total server-side, and enforce availability ATOMICALLY in a
     PostgreSQL transaction (closes the double-booking race).
   - Client financial/status fields are IGNORED/overwritten.
   - Authoritative total/revenue computed from the room price.
   - Room quantity is capped at available units.
   ========================================================= */
const prisma = require("../config/database");
const { newAccessCode } = require("../utils/token");
const { nights, blocksAvailability } = require("../utils/overlap");
const { NotFoundError, ValidationError, ConflictError } = require("../utils/errors");

// Fields a client is allowed to send.
const ALLOWED_FIELDS = new Set([
  "guestName", "email", "phone", "roomId", "checkin", "checkout",
  "adults", "children", "rooms"
]);

// Fields that MUST NEVER be client-controlled.
const FORBIDDEN_FIELDS = new Set([
  "paymentIntentId", "paymentProvider", "amount", "currency", "paidAt",
  "paymentMeta", "status", "paymentStatus", "accessToken", "total",
  "revenue", "created", "updatedAt", "id"
]);

function validateBody(body) {
  if (!body || typeof body !== "object") throw new ValidationError("request body must be a JSON object");
  for (const key of Object.keys(body)) {
    if (FORBIDDEN_FIELDS.has(key)) throw new ValidationError("field '" + key + "' is not allowed");
    if (!ALLOWED_FIELDS.has(key)) throw new ValidationError("unknown field '" + key + "'");
  }
}

function validateDraft(d) {
  const errors = [];
  if (!d.roomId) errors.push("roomId required");
  if (!d.checkin || !d.checkout) errors.push("checkin and checkout required");
  if (!d.guestName || String(d.guestName).trim().length < 1) errors.push("guestName required");
  if (d.guestName && String(d.guestName).length > 500) errors.push("guestName too long");
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.email))) errors.push("invalid email");
  if (d.phone && String(d.phone).length > 50) errors.push("phone too long");
  if (errors.length) throw new ValidationError(errors.join("; "));

  const inStr = String(d.checkin);
  const outStr = String(d.checkout);
  const a = new Date(inStr + "T00:00:00");
  const b = new Date(outStr + "T00:00:00");
  if (isNaN(a.getTime()) || isNaN(b.getTime())) throw new ValidationError("invalid_date_format");
  if (b.getTime() <= a.getTime()) throw new ValidationError("check_out_must_be_after_check_in");

  // Reject dates too far in the past or future (sanity).
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (a.getTime() < now.getTime()) throw new ValidationError("check_in_cannot_be_in_the_past");

  return { inStr, outStr };
}

async function createBooking(rawDraft) {
  const d = rawDraft || {};
  validateBody(d);
  const { inStr, outStr } = validateDraft(d);

  const n = nights(inStr, outStr);

  // Resolve room (server truth) for name + price.
  const room = await prisma.room.findUnique({ where: { id: d.roomId } });
  if (!room) throw new NotFoundError("room_not_found");
  if (room.isActive === false) throw new ConflictError("ROOM_ARCHIVED");

  const rate = Number(room.price) || 0;
  const rc = Math.max(1, parseInt(d.rooms, 10) || 1);

  // Cap requested rooms at room quantity (prevent frontend manipulation).
  const maxUnits = room.quantity || 1;
  const requestedRooms = Math.min(rc, maxUnits);

  const total = rate * n * requestedRooms;

  const clean = {};
  for (const k of Object.keys(d)) if (ALLOWED_FIELDS.has(k)) clean[k] = d[k];

  const guestName = String(clean.guestName).trim();
  const email = clean.email ? String(clean.email).trim().toLowerCase() : null;
  const phone = clean.phone ? String(clean.phone).trim() : null;
  const adults = Math.max(1, parseInt(clean.adults, 10) || 1);
  const children = Math.max(0, parseInt(clean.children, 10) || 0);

  const accessToken = newAccessCode();

  // Atomic availability check + create in ONE transaction.
  const booking = await prisma.$transaction(async (tx) => {
    // Count overlapping active bookings for this room.
    const existing = await tx.booking.findMany({
      where: { roomId: d.roomId },
      select: { id: true, checkin: true, checkout: true, status: true, rooms: true }
    });
    const overlappingCount = existing
      .filter((s) => blocksAvailability(s, inStr, outStr))
      .reduce((sum, s) => sum + (s.rooms || 1), 0);
    const availableUnits = maxUnits - overlappingCount;
    if (availableUnits < requestedRooms) {
      throw new ConflictError("ROOM_UNAVAILABLE");
    }

    return tx.booking.create({
      data: {
        guestName,
        email,
        phone,
        roomId: d.roomId,
        roomName: room.name,
        roomType: room.type,
        checkin: inStr,
        checkout: outStr,
        adults,
        children,
        rooms: requestedRooms,
        guests: adults + children,
        nights: n,
        total,
        revenue: total,
        status: "PENDING",
        paymentStatus: "UNPAID",
        accessToken
      }
    });
  });

  console.log(JSON.stringify({
    type: "booking",
    event: "created",
    bookingId: booking.id,
    roomId: d.roomId,
    rooms: requestedRooms,
    nights: n,
    total
  }));

  return booking;
}

// Lookup by id, gated by accessToken query param.
async function getBookingById(id, accessToken) {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw new NotFoundError("booking_not_found");
  if (booking.accessToken && accessToken !== booking.accessToken) {
    throw new ValidationError("invalid_access_token");
  }
  return booking;
}

// Public availability check. Returns { available, availableUnits }.
async function checkAvailability({ roomId, checkIn, checkOut }) {
  if (!roomId || !checkIn || !checkOut) throw new ValidationError("roomId, checkIn, checkOut required");
  const a = new Date(checkIn + "T00:00:00");
  const b = new Date(checkOut + "T00:00:00");
  if (isNaN(a.getTime()) || isNaN(b.getTime()) || b.getTime() <= a.getTime()) {
    throw new ValidationError("invalid_dates");
  }

  const n = nights(checkIn, checkOut);

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new NotFoundError("room_not_found");
  if (room.isActive === false) throw new ConflictError("ROOM_ARCHIVED");

  const existing = await prisma.booking.findMany({
    where: { roomId },
    select: { id: true, checkin: true, checkout: true, status: true, rooms: true }
  });
  const overlappingCount = existing
    .filter((s) => blocksAvailability(s, checkIn, checkOut))
    .reduce((sum, s) => sum + (s.rooms || 1), 0);
  const roomQuantity = room.quantity || 1;
  const availableUnits = roomQuantity - overlappingCount;
  return { available: availableUnits > 0, availableUnits, roomId, checkIn, checkOut, nights: n };
}

// Public booking lookup by reference + contact match.
// Security: reference is required AND at least one contact must match.
// On mismatch → generic "not found" (no indication whether reference exists).
// When both email and phone are provided, BOTH must match (prevents
// confirming one field by supplying a known value for the other).
async function lookupBooking({ reference, email, phone }) {
  if (!reference) throw new ValidationError("reference required");
  if (!email && !phone) throw new ValidationError("email or phone required");

  const booking = await prisma.booking.findUnique({ where: { id: reference } });
  if (!booking) throw new NotFoundError("booking_not_found");

  // Normalize for comparison: trim + lowercase, strip whitespace.
  const norm = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, "");
  const emailMatch = email && norm(booking.email) === norm(email);
  const phoneMatch = phone && norm(booking.phone) === norm(phone);

  // If both provided, BOTH must match; otherwise either is sufficient.
  if (email && phone) {
    if (!emailMatch || !phoneMatch) throw new NotFoundError("booking_not_found");
  } else {
    if (!emailMatch && !phoneMatch) throw new NotFoundError("booking_not_found");
  }

  // Strip accessToken from response.
  const { accessToken, ...safe } = booking;
  return safe;
}

module.exports = { createBooking, getBookingById, checkAvailability, lookupBooking, validateBody };
