/* =========================================================
   src/routes/content.routes.js — Public, unauthenticated
   read-only content endpoints + review submission.
   ========================================================= */
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/contentController");
const { validate } = require("../middleware/validate");
const schemas = require("../middleware/schemas");
const { reviewLimiter } = require("../middleware/rateLimit");

router.get("/rooms", ctrl.listRooms);
router.get("/rooms/types", ctrl.listRoomTypes);
router.get("/menu", ctrl.listMenu);
router.get("/gallery", ctrl.listGallery);
router.get("/reviews", ctrl.listReviews);
router.post("/reviews", reviewLimiter, validate(schemas.reviewSubmit), ctrl.submitReview);
router.get("/amenities", ctrl.listAmenities);
router.get("/settings", ctrl.listSettings);

module.exports = router;
