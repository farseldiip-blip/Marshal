// Simulates the createBooking transaction overlap logic (no Firestore needed).
function overlap(inStr, outStr, exIn, exOut) {
  return new Date(inStr + "T00:00:00").getTime() < new Date(exOut + "T00:00:00").getTime()
      && new Date(outStr + "T00:00:00").getTime() > new Date(exIn + "T00:00:00").getTime();
}
function blocks(reqIn, reqOut, existing) {
  return existing.filter(b => {
    const st = b.status || "Pending";
    if (st === "Cancelled" || st === "Checked Out") return false;
    return overlap(reqIn, reqOut, b.checkin, b.checkout);
  }).length > 0;
}
const ex = [
  { status: "Pending", checkin: "2026-08-01", checkout: "2026-08-05" },
  { status: "Cancelled", checkin: "2026-08-10", checkout: "2026-08-12" },
  { status: "Checked Out", checkin: "2026-07-01", checkout: "2026-07-03" }
];
let pass = 0, fail = 0;
function ck(n, c) { if (c) { pass++; console.log("PASS", n); } else { fail++; console.log("FAIL", n); } }
ck("overlap rejected", blocks("2026-08-03", "2026-08-06", ex) === true);
ck("back-to-back allowed (out==in)", blocks("2026-08-05", "2026-08-08", ex) === false);
ck("cancelled does not block", blocks("2026-08-11", "2026-08-13", ex) === false);
ck("checkedout does not block", blocks("2026-07-02", "2026-07-04", ex) === false);
ck("free range allowed", blocks("2026-09-01", "2026-09-03", ex) === false);
ck("overlap predicate true", overlap("2026-08-03", "2026-08-06", "2026-08-01", "2026-08-05") === true);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
