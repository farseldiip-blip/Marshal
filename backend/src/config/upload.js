/* =========================================================
   src/config/upload.js — Multer middleware for image uploads.
   Memory storage: buffer passed to Cloudinary stream.
   ========================================================= */
const multer = require("multer");
const { ValidationError } = require("../utils/errors");

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ValidationError("Only JPEG, PNG, and WebP images are allowed"));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE }
});

module.exports = upload;
