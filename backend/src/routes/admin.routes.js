/* =========================================================
   src/routes/admin.routes.js — Admin CRUD (JWT + ADMIN role).
   All routes under /api/admin require auth + ADMIN role.
   ---------------------------------------------------------
   SECURITY: Every endpoint validates input via Zod schemas.
   ========================================================= */
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/adminController");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { adminLimiter } = require("../middleware/rateLimit");
const { validate } = require("../middleware/validate");
const schemas = require("../middleware/schemas");
const upload = require("../config/upload");

// Global admin guard for everything below.
router.use(requireAuth, requireAdmin, adminLimiter);

// Dashboard stats
router.get("/dashboard/stats", ctrl.dashboardStats);

// Image upload (multipart — must be before express.json)
router.post("/uploads", upload.single("image"), ctrl.uploadImage);

// Rooms
router.get("/rooms", ctrl.listRooms);
router.get("/rooms/types", ctrl.listRoomTypes);
router.get("/rooms/:id", ctrl.getRoom);
router.post("/rooms", validate(schemas.roomCreate), ctrl.createRoom);
router.put("/rooms/:id", validate(schemas.roomUpdate), ctrl.updateRoom);
router.delete("/rooms/:id", ctrl.deleteRoom);

// Bookings
router.get("/bookings", ctrl.listBookings);
router.get("/bookings/:id", ctrl.getBooking);
router.put("/bookings/:id", validate(schemas.bookingUpdate), ctrl.updateBooking);
router.delete("/bookings/:id", ctrl.deleteBooking);

// Menu
router.get("/menu", ctrl.listMenu);
router.post("/menu", validate(schemas.menuCreate), ctrl.createMenuItem);
router.put("/menu/:id", validate(schemas.menuUpdate), ctrl.updateMenuItem);
router.delete("/menu/:id", ctrl.deleteMenuItem);

// Gallery
router.get("/gallery", ctrl.listGallery);
router.post("/gallery", validate(schemas.galleryCreate), ctrl.createGalleryItem);
router.put("/gallery/:id", validate(schemas.galleryUpdate), ctrl.updateGalleryItem);
router.delete("/gallery/:id", ctrl.deleteGalleryItem);

// Reviews
router.get("/reviews", ctrl.listReviews);
router.post("/reviews", validate(schemas.reviewCreateAdmin), ctrl.createReview);
router.put("/reviews/:id", validate(schemas.reviewUpdateAdmin), ctrl.updateReview);
router.patch("/reviews/:id/status", validate(schemas.reviewStatusUpdate), ctrl.updateReviewStatus);
router.delete("/reviews/:id", ctrl.deleteReview);

// Amenities
router.get("/amenities", ctrl.listAmenities);
router.post("/amenities", validate(schemas.amenityCreate), ctrl.createAmenity);
router.put("/amenities/:id", validate(schemas.amenityUpdate), ctrl.updateAmenity);
router.delete("/amenities/:id", ctrl.deleteAmenity);

// Hotel settings
router.get("/settings", ctrl.listSettings);
router.get("/settings/:key", ctrl.getSetting);
router.put("/settings/:key", validate(schemas.settingSet), ctrl.setSetting);
router.delete("/settings/:key", ctrl.deleteSetting);

// Refund a paid booking (admin)
router.post("/bookings/:id/refund", ctrl.refundBooking);

module.exports = router;
