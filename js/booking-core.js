/* =========================================================
   booking-core.js — Booking architecture + room availability.
   ---------------------------------------------------------
   PHASE 1 ONLY: architecture, availability logic, and
   booking creation (status: Pending). No payment, no
   WhatsApp/email, no external integrations.

   Single source of truth: Firestore `bookings` (+ `rooms`).
   In demo mode it falls back to window.__mgSeed and a
   localStorage overlay so created bookings persist for the
   session and actually block double-booking.

   Exposed as window.MGBooking.
   ========================================================= */
(function () {
  "use strict";

  /* ---- date helpers (dates are YYYY-MM-DD, treated as whole days) ---- */
  function parse(d) { return d ? new Date(d + "T00:00:00") : null; }
  function nights(inStr, outStr) {
    const a = parse(inStr), b = parse(outStr);
    if (!a || !b) return 0;
    const n = Math.round((b - a) / 86400000);
    return n > 0 ? n : 0;
  }

  /* Half-open interval overlap.
     A stay occupies [checkin, checkout). Check-out day is FREE.
     Overlap exists iff requestIn < existingOut AND requestOut > existingIn.
     This correctly handles: same check-in, same check-out, fully inside,
     fully outside, and back-to-back (existingOut === requestIn => no overlap). */
  function isOverlap(reqIn, reqOut, exIn, exOut) {
    const a = parse(reqIn), b = parse(reqOut), c = parse(exIn), d = parse(exOut);
    if (!a || !b || !c || !d) return false;
    return a.getTime() < d.getTime() && b.getTime() > c.getTime();
  }

  /* ---- room resolution (selected option is a TYPE, map to a concrete room) ---- */
  const TYPE_TO_ROOM = {
    "Deluxe Room": "r1",
    "Executive Suite": "r2",      // closest match: Nile View Suite
    "Nile View Suite": "r2",
    "Presidential Villa": "r3"
  };

  async function getRooms() {
    return (window.MGSiteData && await window.MGSiteData.getList("rooms")) || [];
  }

  function roomById(rooms, id) { return rooms.find(r => r.id === id) || null; }

  function resolveRoom(typeOrId) {
    // Synchronous best-effort using the seed (used for price preview before async load).
    const seed = (window.__mgSeed && typeof window.__mgSeed === "function") ? window.__mgSeed() : null;
    const rooms = (seed && seed.rooms) || [];
    if (!typeOrId) return rooms[0] || null;
    let id = TYPE_TO_ROOM[typeOrId] || null;
    if (!id && /^[a-z]\d+$/i.test(typeOrId)) id = typeOrId; // already an id
    return roomById(rooms, id) || rooms.find(r => r.type === typeOrId) || rooms[0] || null;
  }

  /* ---- Demo booking source ----
     SHARED with the Admin Dashboard Demo store. Both the public
     booking flow and the admin Bookings section read/write the SAME
     localStorage key (mg-demo-db) with the SAME shape:
        { rooms:[...], bookings:[...], ... }   (see dashboard.js Demo)
     so a public booking shows up in admin, and an admin status change
     affects public availability — without duplicating data.
     In live mode this is bypassed entirely (Firestore is the source). */
  const DEMO_DB_KEY = "mg-demo-db";

  function loadDemoDb() {
    try {
      const raw = localStorage.getItem(DEMO_DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    // First run: seed from canonical seed-data.js and persist it.
    const db = (window.__mgSeed && typeof window.__mgSeed === "function") ? window.__mgSeed() : { bookings: [] };
    try { localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db)); } catch (e) {}
    return db;
  }
  function saveDemoDb(db) {
    try { localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db)); } catch (e) {}
  }
  function allDemoBookings() {
    const db = loadDemoDb();
    return (db.bookings || []).slice();
  }

  async function getBookingsForRoom(roomId) {
    // Live: read from Firestore via the shared data layer.
    if (window.MGSiteData && window.MGFirebaseServices && window.MGFirebaseServices.isLive()) {
      const all = await window.MGSiteData.getList("bookings") || [];
      return all.filter(b => (b.roomId || "") === roomId);
    }
    // Demo: seed + any locally created bookings.
    return allDemoBookings().filter(b => (b.roomId || "") === roomId);
  }

  /* ---- availability ---- */
  // Returns { available, conflicting: [booking...], reason }
  async function getAvailability(roomId, inStr, outStr) {
    if (!roomId || !inStr || !outStr) return { available: false, conflicting: [], reason: "missing" };
    if (nights(inStr, outStr) <= 0) return { available: false, conflicting: [], reason: "dates" };
    const bookings = await getBookingsForRoom(roomId);
    const conflicting = bookings.filter(b => {
      const st = b.status || "Pending";
      // Cancelled stays are void. Checked Out stays are complete -> the room
      // is free now and must not block ANY requested dates (incl. historical
      // overlaps). Only active/upcoming stays block availability.
      if (st === "Cancelled" || st === "Checked Out") return false;
      return isOverlap(inStr, outStr, b.checkin, b.checkout);
    });
    return { available: conflicting.length === 0, conflicting, reason: conflicting.length ? "overlap" : null };
  }

  function priceFor(room, nightCount, roomsCount) {
    const rate = Number(room && room.price) || 0;
    const n = Math.max(0, nightCount | 0);
    const rc = Math.max(1, roomsCount | 0);
    return rate * n * rc;
  }

  /* ---- create booking (Pending) ---- */
  // draft: { guestName, email, phone, roomId, checkin, checkout,
  //           adults, children, rooms }
  async function createBooking(draft) {
    draft = draft || {};
    const room = resolveRoom(draft.roomId);
    if (!room) throw new Error("Unknown room");
    const n = nights(draft.checkin, draft.checkout);
    if (n <= 0) throw new Error("Invalid dates");

    // Final availability guard (prevent race / double booking).
    const avail = await getAvailability(draft.roomId, draft.checkin, draft.checkout);
    if (!avail.available) throw new Error("Selected dates are no longer available");

    const total = priceFor(room, n, draft.rooms || 1);
    const booking = {
      guestName: draft.guestName || "Guest",
      email: draft.email || "",
      phone: draft.phone || "",
      roomId: room.id,
      roomName: room.name,
      room: room.name,                 // dashboard compat
      roomType: room.type || room.name,
      checkin: draft.checkin,
      checkout: draft.checkout,
      adults: draft.adults || 1,
      children: draft.children || 0,
      rooms: draft.rooms || 1,
      guests: (draft.adults || 1) + (draft.children || 0), // dashboard compat
      nights: n,
      total: total,
      revenue: total,                 // dashboard compat
      status: "Pending",
      paymentStatus: "Unpaid",
      created: new Date().toISOString()
    };

    // Live path: server-authoritative creation (Firestore transaction
    // inside the createBooking Cloud Function — closes the live
    // double-booking race). The function returns the new id; the
    // onBookingCreate trigger stamps accessToken, which we re-read.
    if (window.MGSiteData && window.MGFirebaseServices && window.MGFirebaseServices.isLive()) {
      const FB = window.MGFirebase;
      if (FB && FB.callFunction) {
        const res = await FB.callFunction("createBooking", {
          guestName: booking.guestName, email: booking.email, phone: booking.phone,
          roomId: booking.roomId, checkin: booking.checkin, checkout: booking.checkout,
          adults: booking.adults, children: booking.children, rooms: booking.rooms
        });
        if (res && res.id) {
          // Re-read so the server-stamped accessToken is captured.
          const full = await window.MGSiteData.getById("bookings", res.id);
          if (full) return full;
          return { ...booking, id: res.id };
        }
      }
      return await window.MGSiteData.create("bookings", booking);
    }

    // Demo path: append to the SHARED mg-demo-db.bookings so the admin
    // dashboard sees it and it blocks re-booking on the public side.
    const db = loadDemoDb();
    const id = "pb_" + Date.now();
    // Demo-only token (no real security in demo mode). In live mode the
    // authoritative accessToken is stamped by the backend trigger and
    // returned via MGSiteData.create -> getById.
    const saved = { ...booking, id, accessToken: "demo_" + id };
    db.bookings = db.bookings || [];
    db.bookings.push(saved);
    saveDemoDb(db);
    return saved;
  }

  window.MGBooking = {
    nights, isOverlap, getAvailability, priceFor,
    resolveRoom, createBooking, getBookingsForRoom
  };
})();
