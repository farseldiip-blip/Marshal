/* =========================================================
   src/controllers/bookingController.js
   ========================================================= */
const { createBooking, getBookingById, checkAvailability, lookupBooking, getMyBookings } = require("../services/bookingService");

function create(req, res, next) {
  const userId = req.user ? req.user.sub : null;
  createBooking(req.body, userId)
    .then((booking) => res.status(201).json({ ok: true, booking }))
    .catch(next);
}

function getById(req, res, next) {
  const { id } = req.params;
  const accessToken = req.query.accessToken;
  const userId = req.user ? req.user.sub : null;
  getBookingById(id, accessToken, userId)
    .then((booking) => res.json({ ok: true, booking }))
    .catch(next);
}

function mine(req, res, next) {
  const userId = req.user.sub;
  getMyBookings(userId)
    .then((bookings) => res.json({ ok: true, bookings }))
    .catch(next);
}

function availability(req, res, next) {
  const { roomId, checkIn, checkOut } = req.query;
  checkAvailability({ roomId, checkIn, checkOut })
    .then((data) => res.json({ ok: true, data }))
    .catch(next);
}

function lookup(req, res, next) {
  const { reference, email, phone } = req.body || {};
  lookupBooking({ reference, email, phone })
    .then((booking) => res.json({ ok: true, booking }))
    .catch(next);
}

module.exports = { create, getById, mine, availability, lookup };
