/* =========================================================
   src/services/contentService.js — Public read-only content.
   ---------------------------------------------------------
   No authentication. Reads via Prisma only. Delegates to the
   same list functions used by the admin layer so behavior
   stays consistent. Returns arrays (possibly empty).
   ========================================================= */
const prisma = require("../config/database");
const svc = require("./adminService");

// Public rooms: only active rooms are shown on the site.
async function listPublicRooms() {
  return prisma.room.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
}

// Public reviews: only PUBLISHED ones are shown on the site.
async function listPublicReviews() {
  return prisma.review.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, author: true, email: true, rating: true, comment: true, status: true, createdAt: true }
  });
}

// Public review submission (always PENDING)
async function submitReview(data) {
  return prisma.review.create({
    data: {
      author: data.name,
      email: data.email || null,
      rating: data.rating,
      comment: data.review,
      status: "PENDING",
      approved: false
    }
  });
}

module.exports = {
  listRooms: listPublicRooms,
  listRoomTypes: svc.listRoomTypes,
  listMenu: svc.listMenu,
  listGallery: svc.listGallery,
  listAmenities: svc.listAmenities,
  listSettings: svc.listSettings,
  listPublicReviews,
  submitReview
};
