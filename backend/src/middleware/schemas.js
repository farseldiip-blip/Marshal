/* =========================================================
   src/middleware/schemas.js — Zod validation schemas for all
   admin and public API endpoints.
   ---------------------------------------------------------
   RULES:
   - All strings are trimmed and length-capped.
   - No NaN, Infinity, or negative numbers for quantities.
   - Unexpected fields are rejected (strict mode).
   ========================================================= */
const { z } = require("zod");

const MAX_STR = 500;
const MAX_TEXT = 5000;
const MAX_URL = 2048;

// ── Room ────────────────────────────────────────────────
const roomCreate = z.object({
  name: z.string().trim().min(1, "name required").max(MAX_STR),
  type: z.string().trim().min(1, "type required").max(MAX_STR),
  quantity: z.number().int().min(0).max(9999).default(1),
  isActive: z.boolean().default(true),
  price: z.number().min(0).max(999999),
  description: z.string().trim().max(MAX_TEXT).nullable().optional(),
  images: z.array(z.string().url().max(MAX_URL)).max(20).default([]),
  amenities: z.array(z.string().trim().max(100)).max(50).default([]),
  capacity: z.number().int().min(1).max(999).default(2)
}).strict();

const roomUpdate = z.object({
  name: z.string().trim().min(1).max(MAX_STR).optional(),
  type: z.string().trim().min(1).max(MAX_STR).optional(),
  quantity: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
  price: z.number().min(0).max(999999).optional(),
  description: z.string().trim().max(MAX_TEXT).nullable().optional(),
  images: z.array(z.string().url().max(MAX_URL)).max(20).optional(),
  amenities: z.array(z.string().trim().max(100)).max(50).optional(),
  capacity: z.number().int().min(1).max(999).optional()
}).strict();

// ── Booking (admin update) ──────────────────────────────
const bookingUpdate = z.object({
  guestName: z.string().trim().min(1).max(MAX_STR).optional(),
  email: z.string().email().max(254).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  status: z.enum(["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED"]).optional(),
  paymentStatus: z.enum(["UNPAID", "PENDING", "PAID", "FAILED", "REFUNDED"]).optional(),
  adults: z.number().int().min(0).max(99).optional(),
  children: z.number().int().min(0).max(99).optional(),
  rooms: z.number().int().min(1).max(999).optional()
}).strict();

// ── MenuItem ────────────────────────────────────────────
const menuCreate = z.object({
  name: z.string().trim().min(1, "name required").max(MAX_STR),
  description: z.string().trim().max(MAX_TEXT).nullable().optional(),
  price: z.number().min(0).max(99999),
  category: z.string().trim().max(MAX_STR).nullable().optional(),
  image: z.string().url().max(MAX_URL).nullable().optional(),
  available: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0)
}).strict();

const menuUpdate = menuCreate.partial();

// ── Gallery ─────────────────────────────────────────────
const galleryCreate = z.object({
  title: z.string().trim().max(MAX_STR).nullable().optional(),
  image: z.string().url("invalid_url").max(MAX_URL),
  caption: z.string().trim().max(MAX_TEXT).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0)
}).strict();

const galleryUpdate = galleryCreate.partial();

// ── Review (admin — can set status) ─────────────────────
const reviewCreateAdmin = z.object({
  author: z.string().trim().min(1, "name required").max(MAX_STR),
  email: z.string().email().max(254).nullable().optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1, "review text required").max(MAX_TEXT),
  status: z.enum(["PENDING", "PUBLISHED", "REJECTED"]).default("PENDING")
}).strict();

const reviewUpdateAdmin = reviewCreateAdmin.partial();

// ── Review (public — status always forced to PENDING) ────
const reviewSubmit = z.object({
  name: z.string().trim().min(1, "name is required").max(100),
  email: z.string().email("invalid email").max(254).nullable().optional(),
  rating: z.number().int().min(1, "rating must be 1-5").max(5),
  review: z.string().trim().min(10, "review must be at least 10 characters").max(2000)
}).strict();

// ── Review status update (admin) ─────────────────────────
const reviewStatusUpdate = z.object({
  status: z.enum(["PENDING", "PUBLISHED", "REJECTED"])
}).strict();

// ── Amenity ─────────────────────────────────────────────
const amenityCreate = z.object({
  name: z.string().trim().min(1, "name required").max(MAX_STR),
  icon: z.string().trim().max(MAX_STR).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0)
}).strict();

const amenityUpdate = amenityCreate.partial();

// ── Settings ────────────────────────────────────────────
const settingSet = z.object({
  value: z.string().max(MAX_TEXT),
  label: z.string().trim().max(MAX_STR).nullable().optional()
}).strict();

// ── Booking (public creation) ──────────────────────────
const bookingCreate = z.object({
  guestName: z.string().trim().min(1, "guestName required").max(MAX_STR),
  email: z.string().email("invalid_email").max(254).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  roomId: z.string().min(1, "roomId required"),
  checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date_format"),
  checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date_format"),
  adults: z.number().int().min(1).max(99).default(1),
  children: z.number().int().min(0).max(99).default(0),
  rooms: z.number().int().min(1).max(999).default(1)
}).strict();

// ── Booking lookup ──────────────────────────────────────
const bookingLookup = z.object({
  reference: z.string().min(1, "reference required"),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "") ? undefined : v,
    z.string().email().max(254).optional()
  ),
  phone: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "") ? undefined : v,
    z.string().trim().max(50).optional()
  )
}).strict().refine(
  (d) => d.email || d.phone,
  { message: "email or phone required" }
);

module.exports = {
  roomCreate, roomUpdate,
  bookingUpdate, bookingCreate, bookingLookup,
  menuCreate, menuUpdate,
  galleryCreate, galleryUpdate,
  reviewCreateAdmin, reviewUpdateAdmin, reviewSubmit, reviewStatusUpdate,
  amenityCreate, amenityUpdate,
  settingSet
};
