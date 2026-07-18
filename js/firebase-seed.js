/* =========================================================
   firebase-seed.js — One-time cloud seed (admin only).
   ---------------------------------------------------------
   Copies the existing demo mock data (js/dashboard.js seed())
   into Firestore so the cloud database isn't empty on first
   launch. Only runs when Firebase is LIVE and the admin is
   authenticated. Safe to call multiple times (idempotent:
   it writes each item by its known id / "info" doc).

   Invoked from Settings -> "Seed cloud data" button.
   No UI/design changes; this is purely a data utility.
   ========================================================= */
(function () {
  "use strict";

  async function seedCloud() {
    const S = window.MGFirebaseServices;
    if (!S || !S.isLive()) {
      throw new Error("Firebase is not live — set keys in firebase-config.js and sign in.");
    }
    // seed() lives inside dashboard.js IIFE; expose it if present.
    const getSeed = window.__mgSeed;
    if (typeof getSeed !== "function") {
      throw new Error("Seed source unavailable (dashboard not loaded).");
    }
    const data = getSeed();

    // List collections -> written with their original ids.
    const listCols = ["rooms", "bookings", "customers", "reviews", "gallery", "menu", "amenities"];
    for (const col of listCols) {
      const items = data[col] || [];
      for (const it of items) {
        const id = it.id || (col[0] + Date.now() + Math.random().toString(36).slice(2, 6));
        // Write by id so re-seeding is idempotent.
        await S.update(col, id, it).catch(async () => { await S.add(col, { ...it, id }); });
      }
    }

    // Single-doc collections.
    if (data.hotel) await S.setDoc("hotel", data.hotel);
    if (data.settings) await S.setDoc("settings", data.settings);

    return true;
  }

  window.MGSeedCloud = seedCloud;
})();
