/* =========================================================
   src/controllers/adminController.js — Admin CRUD endpoints.
   ========================================================= */
const svc = require("../services/adminService");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const cloudinary = require("../config/cloudinary");

// Each sub-router registered under /api/admin.
// All routes require JWT auth + ADMIN role (applied in routes file).

function json(fn) {
  return (req, res, next) => fn(req, res, next).then((data) => res.json({ ok: true, data })).catch(next);
}
function jsonCreated(fn) {
  return (req, res, next) => fn(req, res, next).then((data) => res.status(201).json({ ok: true, data })).catch(next);
}

module.exports = {
  // Rooms
  listRooms: json(svc.listRooms),
  listRoomTypes: json(svc.listRoomTypes),
  getRoom: (req, res, next) => svc.getRoom(req.params.id).then((d) => res.json({ ok: true, data: d })).catch(next),
  createRoom: jsonCreated((req) => svc.createRoom(req.body)),
  updateRoom: json((req) => svc.updateRoom(req.params.id, req.body)),
  deleteRoom: (req, res, next) => svc.deleteRoom(req.params.id).then(() => res.json({ ok: true })).catch(next),

  // Bookings
  listBookings: json(svc.listBookings),
  getBooking: (req, res, next) => svc.getBooking(req.params.id).then((d) => res.json({ ok: true, data: d })).catch(next),
  updateBooking: json((req) => svc.updateBooking(req.params.id, req.body)),
  deleteBooking: (req, res, next) => svc.deleteBooking(req.params.id).then(() => res.json({ ok: true })).catch(next),

  // Menu
  listMenu: json(svc.listMenu),
  createMenuItem: jsonCreated((req) => svc.createMenuItem(req.body)),
  updateMenuItem: json((req) => svc.updateMenuItem(req.params.id, req.body)),
  deleteMenuItem: (req, res, next) => svc.deleteMenuItem(req.params.id).then(() => res.json({ ok: true })).catch(next),

  // Gallery
  listGallery: json(svc.listGallery),
  createGalleryItem: jsonCreated((req) => svc.createGalleryItem(req.body)),
  updateGalleryItem: json((req) => svc.updateGalleryItem(req.params.id, req.body)),
  deleteGalleryItem: (req, res, next) => svc.deleteGalleryItem(req.params.id).then(() => res.json({ ok: true })).catch(next),

  // Reviews
  listReviews: json((req) => svc.listReviews(req.query.status)),
  createReview: jsonCreated((req) => svc.createReview(req.body)),
  updateReview: json((req) => svc.updateReview(req.params.id, req.body)),
  updateReviewStatus: json((req) => svc.updateReviewStatus(req.params.id, req.body.status)),
  deleteReview: (req, res, next) => svc.deleteReview(req.params.id).then(() => res.json({ ok: true })).catch(next),

  // Amenities
  listAmenities: json(svc.listAmenities),
  createAmenity: jsonCreated((req) => svc.createAmenity(req.body)),
  updateAmenity: json((req) => svc.updateAmenity(req.params.id, req.body)),
  deleteAmenity: (req, res, next) => svc.deleteAmenity(req.params.id).then(() => res.json({ ok: true })).catch(next),

  // Settings
  listSettings: json(svc.listSettings),
  getSetting: (req, res, next) => svc.getSetting(req.params.key).then((d) => res.json({ ok: true, data: d })).catch(next),
  setSetting: json((req) => svc.setSetting(req.params.key, req.body.value, req.body.label)),
  deleteSetting: (req, res, next) => svc.deleteSetting(req.params.key).then(() => res.json({ ok: true })).catch(next),

  // Refund (admin)
  refundBooking: (req, res, next) => {
    const { refundPayment } = require("../services/paymentService");
    refundPayment(req.params.id).then((r) => res.json(r)).catch(next);
  },

  // Dashboard stats
  dashboardStats: json(svc.dashboardStats),

  // Image upload to Cloudinary
  uploadImage: (req, res, next) => {
    if (!req.file) {
      return res.status(422).json({ error: { code: "VALIDATION", message: "No image file provided" } });
    }
    const stream = cloudinary.uploader.upload_stream(
      { folder: "marshal-hotel", resource_type: "image" },
      (err, result) => {
        if (err) {
          console.error("[upload] Cloudinary error:", err.message);
          return res.status(500).json({ error: { code: "UPLOAD_FAILED", message: "Image upload failed" } });
        }
        return res.status(201).json({
          ok: true,
          data: { url: result.secure_url, publicId: result.public_id }
        });
      }
    );
    stream.end(req.file.buffer);
  },

  requireAuth,
  requireAdmin
};
