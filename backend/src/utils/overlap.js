/* =========================================================
   src/utils/overlap.js — Date/availability helpers.
   Dates are YYYY-MM-DD (date-only). Overlap is HALF-OPEN:
   a booking ending on day X does NOT block a booking starting
   on day X (back-to-back allowed).
   ========================================================= */

// Whole nights between two date strings.
function nights(inStr, outStr) {
  const a = new Date(inStr + "T00:00:00");
  const b = new Date(outStr + "T00:00:00");
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86400000);
}

// Does an existing stay [exIn, exOut) block a desired [inStr, outStr)?
function blocksAvailability(existing, inStr, outStr) {
  const st = existing.status || "PENDING";
  if (st === "CANCELLED" || st === "CHECKED_OUT" || st === "NO_SHOW") return false; // void
  const exIn = existing.checkin;
  const exOut = existing.checkout;
  if (!exIn || !exOut) return false;
  const desiredStart = new Date(inStr + "T00:00:00").getTime();
  const desiredEnd = new Date(outStr + "T00:00:00").getTime();
  const exStart = new Date(exIn + "T00:00:00").getTime();
  const exEnd = new Date(exOut + "T00:00:00").getTime();
  return desiredStart < exEnd && desiredEnd > exStart;
}

module.exports = { nights, blocksAvailability };
