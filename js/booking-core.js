/* =========================================================
   booking-core.js — Booking architecture + room availability.
   ---------------------------------------------------------
   Phase 3: REST API (PostgreSQL) is the source of truth.
   - Availability: GET /api/bookings/availability
   - Creation:     POST /api/bookings
   - Demo mode:    localStorage (mg-demo-db) fallback.

   Exposed as window.MGBooking.
   ========================================================= */
(function () {
  "use strict";

  /* ---- config ---- */
  function apiBase() {
    return (window.MGApiConfig && window.MGApiConfig.baseUrl) || "";
  }
  function isLive() {
    return !!(window.MGApiClient && apiBase());
  }

  /* ---- date helpers (YYYY-MM-DD, whole days) ---- */
  function parse(d) { return d ? new Date(d + "T00:00:00") : null; }
  function nights(inStr, outStr) {
    var a = parse(inStr), b = parse(outStr);
    if (!a || !b) return 0;
    var n = Math.round((b - a) / 86400000);
    return n > 0 ? n : 0;
  }

  /* Half-open interval overlap. */
  function isOverlap(reqIn, reqOut, exIn, exOut) {
    var a = parse(reqIn), b = parse(reqOut), c = parse(exIn), d = parse(exOut);
    if (!a || !b || !c || !d) return false;
    return a.getTime() < d.getTime() && b.getTime() > c.getTime();
  }

  /* ---- room resolution (always from database/seed, never hardcoded) ---- */

  function getRooms() {
    return (window.MGSiteData && window.MGSiteData.getList("rooms")) || Promise.resolve([]);
  }

  function roomById(rooms, id) {
    for (var i = 0; i < rooms.length; i++) {
      if (rooms[i] && rooms[i].id === id) return rooms[i];
    }
    return null;
  }

  function resolveRoom(typeOrId) {
    // Synchronous best-effort using the seed (for price preview before async load).
    // Never uses hardcoded room name maps — always matches against live data.
    var seed = (window.__mgSeed && typeof window.__mgSeed === "function") ? window.__mgSeed() : null;
    var rooms = (seed && seed.rooms) || [];
    if (!typeOrId) return rooms[0] || null;
    // 1. Exact id match
    var r = roomById(rooms, typeOrId);
    if (r) return r;
    // 2. Type match
    r = rooms.filter(function (r) { return r.type === typeOrId; })[0];
    if (r) return r;
    // 3. Name match
    r = rooms.filter(function (r) { return r.name === typeOrId; })[0];
    if (r) return r;
    // 4. Fallback to first room
    return rooms[0] || null;
  }

  /** Async room resolution — fetches real rooms from the API in live mode
   *  so the actual PostgreSQL id is used (not seed IDs r1/r2/r3). */
  function resolveRoomLive(typeOrId) {
    if (!isLive()) return Promise.resolve(resolveRoom(typeOrId));
    return getRooms().then(function (rooms) {
      if (!rooms || !rooms.length) return resolveRoom(typeOrId);
      // 1. Exact id match (already a real PostgreSQL id).
      var r = roomById(rooms, typeOrId);
      if (r) return r;
      // 2. Type match.
      for (var i = 0; i < rooms.length; i++) {
        if (rooms[i].type === typeOrId) return rooms[i];
      }
      // 3. Name match.
      for (var i = 0; i < rooms.length; i++) {
        if (rooms[i].name === typeOrId) return rooms[i];
      }
      // 4. Fall back to first API room.
      return rooms[0] || resolveRoom(typeOrId) || null;
    }).catch(function () {
      return resolveRoom(typeOrId);
    });
  }

  /* ---- payload normalisation (ensures only backend-allowed field names) ---- */
  var ALLOWED_BOOKING_FIELDS = ["guestName", "email", "phone", "roomId", "checkin", "checkout", "adults", "children", "rooms"];
  var FIELD_ALIAS = { checkIn: "checkin", checkOut: "checkout" };

  function normalizePayload(raw) {
    var out = {};
    var keys = Object.keys(raw || {});
    for (var i = 0; i < keys.length; i++) {
      var k = FIELD_ALIAS[keys[i]] || keys[i];
      if (ALLOWED_BOOKING_FIELDS.indexOf(k) !== -1) out[k] = raw[keys[i]];
    }
    return out;
  }

  /* ---- normalisation: backend enums → frontend Title Case ---- */
  // shared.js is always loaded before this file (verified in all HTML pages).
  // MGShared.normalizeBooking maps status/paymentStatus enums and createdAt→created.
  var normalizeBooking = MGShared.normalizeBooking;

  /* ---- Demo booking source ---- */
  var DEMO_DB_KEY = "mg-demo-db";

  function loadDemoDb() {
    try {
      var raw = localStorage.getItem(DEMO_DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    var db = (window.__mgSeed && typeof window.__mgSeed === "function") ? window.__mgSeed() : { bookings: [] };
    try { localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db)); } catch (e) {}
    return db;
  }
  function saveDemoDb(db) {
    try { localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db)); } catch (e) {}
  }
  function allDemoBookings() {
    var db = loadDemoDb();
    return (db.bookings || []).slice();
  }

  /* ---- availability ---- */
  // Returns { available, conflicting: [], reason }
  function getAvailability(roomId, inStr, outStr) {
    if (!roomId || !inStr || !outStr) return Promise.resolve({ available: false, conflicting: [], reason: "missing" });
    if (nights(inStr, outStr) <= 0) return Promise.resolve({ available: false, conflicting: [], reason: "dates" });

    // Live: resolve real room id from API, then check availability.
    if (isLive()) {
      return resolveRoomLive(roomId).then(function (room) {
        var realId = room ? room.id : roomId;
        var url = apiBase() + "/bookings/availability?roomId=" + encodeURIComponent(realId)
          + "&checkIn=" + encodeURIComponent(inStr)
          + "&checkOut=" + encodeURIComponent(outStr);
        return fetch(url, { method: "GET", headers: { Accept: "application/json" } })
          .then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
          })
          .then(function (json) {
            if (json.ok !== true || !json.data) throw new Error("Malformed response");
            return { available: !!json.data.available, conflicting: [], reason: json.data.available ? null : "overlap" };
          });
      }).catch(function () {
        return demoAvailability(roomId, inStr, outStr);
      });
    }

    // Demo: local overlap check.
    return Promise.resolve(demoAvailability(roomId, inStr, outStr));
  }

  function demoAvailability(roomId, inStr, outStr) {
    var bookings = allDemoBookings().filter(function (b) { return (b.roomId || "") === roomId; });
    var conflicting = bookings.filter(function (b) {
      var st = b.status || "Pending";
      if (st === "Cancelled" || st === "Checked Out") return false;
      return isOverlap(inStr, outStr, b.checkin, b.checkout);
    });
    return { available: conflicting.length === 0, conflicting: conflicting, reason: conflicting.length ? "overlap" : null };
  }

  function priceFor(room, nightCount, roomsCount) {
    var rate = Number(room && room.price) || 0;
    var n = Math.max(0, nightCount | 0);
    var rc = Math.max(1, roomsCount | 0);
    return rate * n * rc;
  }

  /* ---- create booking ---- */
  function createBooking(draft) {
    draft = draft || {};
    var n = nights(draft.checkin, draft.checkout);
    if (n <= 0) return Promise.reject(new Error("Invalid dates"));

    var adults = draft.adults || 1;
    var children = draft.children || 0;
    var roomsCount = draft.rooms || 1;

    // Resolve room — in live mode fetch real PostgreSQL id from API.
    var roomPromise = isLive()
      ? resolveRoomLive(draft.roomId)
      : Promise.resolve(resolveRoom(draft.roomId));

    return roomPromise.then(function (room) {
      if (!room) throw new Error("Unknown room");

      // Normalise + build payload — only backend-allowed fields.
      var payload = normalizePayload({
        guestName: draft.guestName || "Guest",
        email: draft.email || "",
        phone: draft.phone || "",
        roomId: room.id,
        checkin: draft.checkin,
        checkout: draft.checkout,
        adults: adults,
        children: children,
        rooms: roomsCount
      });

      // Live: POST /api/bookings
      if (isLive()) {
        var url = apiBase() + "/bookings";
        var headers = { "Content-Type": "application/json", Accept: "application/json" };
        var userToken = localStorage.getItem("mg-user-jwt");
        if (userToken) headers["Authorization"] = "Bearer " + userToken;
        return fetch(url, {
          method: "POST",
          headers: headers,
          body: JSON.stringify(payload)
        })
          .then(function (res) {
            return res.json().then(function (json) {
              if (!res.ok || !json || !json.ok || !json.booking) {
                var msg = (json && json.error && json.error.message) || "Booking failed";
                throw new Error(msg);
              }
              return normalizeBooking(json.booking);
            });
          });
      }

      // Demo path: append to shared localStorage.
      var total = priceFor(room, n, roomsCount);
      var booking = Object.assign({}, payload, {
        roomId: room.id,
        roomName: room.name,
        room: room.name,
        roomType: room.type || room.name,
        guests: adults + children,
        nights: n,
        total: total,
        revenue: total,
        status: "Pending",
        paymentStatus: "Unpaid",
        created: new Date().toISOString()
      });
      var db = loadDemoDb();
      var id = "pb_" + Date.now();
      var saved = Object.assign({}, booking, { id: id, accessToken: "demo_" + id });
      db.bookings = db.bookings || [];
      db.bookings.push(saved);
      saveDemoDb(db);
      return saved;
    });
  }

  /* ---- lookup booking by reference + contact ---- */
  function lookupBooking(reference, email, phone) {
    // Live: POST /api/bookings/lookup
    if (isLive()) {
      var url = apiBase() + "/bookings/lookup";
      var payload = { reference: reference };
      if (email) payload.email = email;
      if (phone) payload.phone = phone;
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          return res.json().then(function (json) {
            if (!res.ok || !json || !json.ok || !json.booking) return null;
            return normalizeBooking(json.booking);
          });
        })
        .catch(function () { return null; });
    }

    // Demo: search localStorage.
    var all = allDemoBookings();
    var b = null;
    for (var i = 0; i < all.length; i++) {
      if ((all[i].id || "") === reference) { b = all[i]; break; }
    }
    if (!b) return Promise.resolve(null);
    var norm = function (v) { return String(v || "").trim().toLowerCase().replace(/\s+/g, ""); };
    var ok = (email && norm(b.email) === norm(email)) || (phone && norm(b.phone) === norm(phone));
    return Promise.resolve(ok ? normalizeBooking(b) : null);
  }

  /* ---- fetch booking by id (with accessToken) ---- */
  function getBookingById(id, accessToken) {
    if (isLive()) {
      var url = apiBase() + "/bookings/" + encodeURIComponent(id) + "?accessToken=" + encodeURIComponent(accessToken || "");
      return fetch(url, { method: "GET", headers: { Accept: "application/json" } })
        .then(function (res) {
          return res.json().then(function (json) {
            if (!res.ok || !json || !json.ok || !json.booking) return null;
            return normalizeBooking(json.booking);
          });
        })
        .catch(function () { return null; });
    }
    var all = allDemoBookings();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) return Promise.resolve(normalizeBooking(all[i]));
    }
    return Promise.resolve(null);
  }

  window.MGBooking = {
    nights: nights,
    isOverlap: isOverlap,
    getAvailability: getAvailability,
    priceFor: priceFor,
    resolveRoom: resolveRoom,
    createBooking: createBooking,
    lookupBooking: lookupBooking,
    getBookingById: getBookingById,
    normalizeBooking: normalizeBooking
  };
})();
