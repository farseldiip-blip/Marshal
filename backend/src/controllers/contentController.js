/* =========================================================
   src/controllers/contentController.js — Public read endpoints
   + public review submission.
   ========================================================= */
const svc = require("../services/contentService");

function json(fn) {
  return (req, res, next) => fn(req, res, next).then((data) => res.json({ ok: true, data })).catch(next);
}

module.exports = {
  listRooms: json(() => svc.listRooms()),
  listRoomTypes: json(() => svc.listRoomTypes()),
  listMenu: json(() => svc.listMenu()),
  listGallery: json(() => svc.listGallery()),
  listReviews: json(() => svc.listPublicReviews()),
  listAmenities: json(() => svc.listAmenities()),
  listSettings: json(() => svc.listSettings()),

  // Public review submission
  submitReview: (req, res, next) => {
    svc.submitReview(req.body)
      .then(() => res.status(201).json({ ok: true, message: "Review submitted successfully" }))
      .catch(next);
  }
};
