/* =========================================================
   backend/scripts/reset-dev-data.js — Development Data Reset
   ---------------------------------------------------------
   Deletes all hotel content and transactional data while
   preserving admin users, authentication config, and
   system settings.

   Usage:
     node backend/scripts/reset-dev-data.js --confirm
     npm run db:reset:dev -- --confirm

   Safety:
     - Refuses to run when NODE_ENV=production
     - Requires explicit --confirm flag
     - Uses Prisma transaction for atomicity
     - Clear console output of what was deleted/preserved
   ========================================================= */
"use strict";

const path = require("path");

// Load env from backend/.env
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { PrismaClient } = require("@prisma/client");

/* ---- Safety guards ---- */
const args = process.argv.slice(2);
const isProduction = process.env.NODE_ENV === "production";
const isConfirm = args.includes("--confirm");

if (isProduction) {
  console.error("\n❌ ABORT: This script refuses to run in production.");
  console.error("   Set NODE_ENV=development or remove NODE_ENV entirely.\n");
  process.exit(1);
}

if (!isConfirm) {
  console.log("\n⚠️  Development Database Reset");
  console.log("   This will delete ALL hotel content and transactional data.");
  console.log("   Admin users and system settings will be preserved.\n");
  console.log("   To proceed, run:\n");
  console.log("     npm run db:reset:dev -- --confirm\n");
  console.log("   Or:\n");
  console.log("     node backend/scripts/reset-dev-data.js --confirm\n");
  process.exit(0);
}

/* ---- Main reset ---- */
async function main() {
  const prisma = new PrismaClient();

  try {
    console.log("\n🔄 Development reset started...\n");

    // Use a transaction so the reset is atomic.
    const result = await prisma.$transaction(async (tx) => {
      // Count before deletion for the summary.
      const counts = {
        payments: await tx.payment.count(),
        bookings: await tx.booking.count(),
        rooms: await tx.room.count(),
        galleryItems: await tx.galleryItem.count(),
        reviews: await tx.review.count(),
        menuItems: await tx.menuItem.count(),
        amenities: await tx.amenity.count(),
        users: await tx.user.count(),
        settings: await tx.hotelSetting.count()
      };

      // Delete in FK-safe order.
      // Payment → Booking → Room → GalleryItem → Review → MenuItem → Amenity
      await tx.payment.deleteMany();
      await tx.booking.deleteMany();
      await tx.room.deleteMany();
      await tx.galleryItem.deleteMany();
      await tx.review.deleteMany();
      await tx.menuItem.deleteMany();
      await tx.amenity.deleteMany();

      return counts;
    });

    // Summary output.
    console.log("Deleted:");
    console.log(`  - ${result.payments} payment record${result.payments !== 1 ? "s" : ""}`);
    console.log(`  - ${result.bookings} booking${result.bookings !== 1 ? "s" : ""}`);
    console.log(`  - ${result.rooms} room${result.rooms !== 1 ? "s" : ""}`);
    console.log(`  - ${result.galleryItems} gallery item${result.galleryItems !== 1 ? "s" : ""}`);
    console.log(`  - ${result.reviews} review${result.reviews !== 1 ? "s" : ""}`);
    console.log(`  - ${result.menuItems} menu item${result.menuItems !== 1 ? "s" : ""}`);
    console.log(`  - ${result.amenities} amenit${result.amenities !== 1 ? "ies" : "y"}`);

    console.log("\nPreserved:");
    console.log(`  - ${result.users} admin user${result.users !== 1 ? "s" : ""}`);
    console.log(`  - ${result.settings} system setting${result.settings !== 1 ? "s" : ""}`);
    console.log("  - Authentication configuration");
    console.log("  - Database schema and migrations");

    console.log("\n✅ Development reset completed successfully.\n");

  } catch (e) {
    console.error("\n❌ Reset failed:", e.message);
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
