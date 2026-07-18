/* Paymob HMAC verification unit test (no provider creds needed).
   Run: node test-paymob-hmac.js
   Validates: valid signature accepted, tampered/again invalid rejected. */
const paymob = require("./paymob");
const crypto = require("crypto");

const SECRET = "test_hmac_secret_123";
// Stub env so module helper uses our secret path.
process.env.PAYMOB_HMAC_SECRET = SECRET;

// Build a Paymob-like callback (real data nested under `obj`).
const obj = {
  obj: {
    id: "12345",
    amount_cents: 15000,
    created_at: "2026-07-18T10:00:00",
    currency: "USD",
    error_occured: false,
    has_parent_transaction: false,
    integration_id: 999,
    is_3d_secure: false,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: "778899", merchant_order_id: "pb_test1" },
    owner: 42,
    pending: false,
    source_data: { pan: "1234", sub_type: "Visa", type: "card" },
    success: true
  }
};

const fields = [
  "amount_cents","created_at","currency","error_occured","has_parent_transaction",
  "id","integration_id","is_3d_secure","is_auth","is_capture","is_refunded",
  "is_standalone_payment","is_voided","order.id","owner","pending",
  "source_data.pan","source_data.sub_type","source_data.type"
];
const dig = (o,p)=>p.split(".").reduce((a,k)=>a==null?undefined:a[k],o);
let concat = "";
for (const f of fields) { let v = dig(obj.obj,f); if (v==null) v=""; concat += String(v); }
const goodHmac = crypto.createHmac("sha512", SECRET).update(concat).digest("hex");

const goodReq = { body: Object.assign({}, obj, { hmac: goodHmac }) };

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log("PASS", name); } else { fail++; console.log("FAIL", name); } }

// 1) Valid signature -> parsed as succeeded, correct bookingId/ref.
try {
  const ev = paymob.verifyWebhook(goodReq);
  check("valid_hmac_accepted", ev.status === "succeeded");
  check("bookingId_from_merchant_order_id", ev.bookingId === "pb_test1");
  check("providerRef_is_order_id", ev.providerRef === "778899");
  check("amount_cents", ev.amountCents === 15000);
} catch (e) { check("valid_hmac_accepted", false); console.log(e.message); }

// 2) Tampered amount (body changed but HMAC from ORIGINAL kept) -> rejected.
try {
  const badBody = Object.assign({}, obj, {
    obj: Object.assign({}, obj.obj, { amount_cents: 99999 }),
    hmac: goodHmac // attacker keeps the old valid signature
  });
  paymob.verifyWebhook({ body: badBody });
  check("tampered_amount_rejected", false);
} catch (e) { check("tampered_amount_rejected", e.message === "invalid_hmac"); }

// 3) Wrong HMAC value -> rejected.
try {
  paymob.verifyWebhook({ body: Object.assign({}, obj, { hmac: "deadbeef".repeat(16) }) });
  check("wrong_hmac_rejected", false);
} catch (e) { check("wrong_hmac_rejected", e.message === "invalid_hmac"); }

// 4) toCents sanity.
check("toCents_150_00", paymob.toCents(150) === 15000);
check("toCents_120_50", paymob.toCents(120.5) === 12050);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
