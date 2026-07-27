/* =========================================================
   src/lib/paymob.js — Paymob (Legacy Accept API) provider.
   ---------------------------------------------------------
   SECURITY:
   - Reads ALL secrets from process.env (server-only).
   - Never used in the frontend. No key leaves this module.
   - The Public Key / iframe URL is returned to the backend,
     which returns ONLY the safe iframe URL to the client.

   Flow (server-side):
     1) POST /api/auth/tokens             -> auth token
     2) POST /api/ecommerce/orders       -> paymob order id
     3) POST /api/acceptance/payment_keys-> payment_key token
     4) Build iframe URL (returned to client)

   Webhook HMAC: Paymob signs the transaction callback with
   HMAC-SHA512 over a specific ordered field concatenation,
   using PAYMOB_HMAC_SECRET. We recompute and compare.
   ========================================================= */
const crypto = require("crypto");
const https = require("https");
const http = require("http");
const { URL } = require("url");
const ENV = require("../config/env");

const BASE = ENV.PAYMOB_BASE_URL || "https://accept.paymob.com";

function required(name) {
  const v = ENV[name];
  if (!v) throw new Error("missing_env:" + name);
  return v;
}

function postJson(path, payload, authToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const body = JSON.stringify(payload);
    const lib = url.protocol === "https:" ? https : http;
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body)
    };
    if (authToken) headers["Authorization"] = "Bearer " + authToken;
    const req = lib.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        headers
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json;
          try { json = JSON.parse(data); } catch (e) { json = {}; }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error("paymob_http_" + res.statusCode + " " + data));
          }
          resolve(json);
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function toCents(amount) {
  return Math.round(Number(amount) * 100);
}

async function authenticate() {
  const apiKey = required("PAYMOB_API_KEY");
  const res = await postJson("/api/auth/tokens", { api_key: apiKey });
  if (!res || !res.token) throw new Error("paymob_auth_failed");
  return res;
}

async function createOrder(auth, { merchantOrderId, amountCents, currency }) {
  const res = await postJson(
    "/api/ecommerce/orders?token=" + encodeURIComponent(auth.token),
    {
      delivery_needed: false,
      merchant_id: auth.profile.id,
      amount_cents: amountCents,
      currency: currency,
      merchant_order_id: String(merchantOrderId)
    }
  );
  if (!res || !res.id) throw new Error("paymob_order_failed");
  return res;
}

async function createPaymentKey(auth, { orderId, amountCents, currency, integrationId, billing }) {
  const res = await postJson(
    "/api/acceptance/payment_keys?token=" + encodeURIComponent(auth.token),
    {
      amount_cents: amountCents,
      expiration: 3600,
      order_id: orderId,
      currency: currency,
      card_integration_id: Number(integrationId),
      billing_data: billing
    }
  );
  if (!res || !res.token) throw new Error("paymob_paymentkey_failed");
  return res.token;
}

function buildBilling(booking) {
  const n = (v) => (v ? String(v).slice(0, 50) : "NA");
  const name = n(booking.guestName).split(" ");
  return {
    email: n(booking.email || booking.id + "@noreply.mg"),
    first_name: name[0] || "Guest",
    last_name: name.slice(1).join(" ") || "Guest",
    phone_number: n(booking.phone || "+0000000000"),
    city: "NA",
    country: "NA",
    street: "NA",
    building: "NA",
    floor: "NA",
    apartment: "NA",
    postal_code: "NA",
    state: "NA"
  };
}

const paymob = {
  name: "paymob",

  async createSession({ bookingId, amount, currency, email, booking }) {
    const integrationId = required("PAYMOB_INTEGRATION_ID");
    const iframeId = required("PAYMOB_IFRAME_ID");

    const auth = await authenticate();
    const amountCents = toCents(amount);
    const order = await createOrder(auth, {
      merchantOrderId: bookingId,
      amountCents,
      currency
    });
    const billing = buildBilling(booking || {});
    const paymentKey = await createPaymentKey(auth, {
      orderId: order.id,
      amountCents,
      currency,
      integrationId,
      billing
    });

    const checkoutUrl =
      BASE + "/api/acceptance/iframes/" + iframeId + "?payment_token=" + encodeURIComponent(paymentKey);

    return {
      checkoutUrl,
      clientToken: null,
      providerRef: String(order.id),
      metadata: { bookingId, orderId: String(order.id) }
    };
  },

  verifyWebhook(req) {
    const hmacSecret = required("PAYMOB_HMAC_SECRET");

    const obj = (req.body && typeof req.body === "object" && !Array.isArray(req.body))
      ? req.body
      : {};
    const receivedHmac = obj.hmac || (req.headers && req.headers["x-paymob-hmac"]) || "";

    const calc = computeHmac(obj, hmacSecret);
    if (!receivedHmac || !timingSafeEqual(receivedHmac, calc)) {
      throw new Error("invalid_hmac");
    }

    const o = obj.obj || obj;
    const success = o.success === true || o.success === "true";
    const isError = o.error_occured === true || o.error_occured === "true";
    const isRefunded = o.is_refunded === true || o.is_refunded === "true";
    const isVoided = o.is_voided === true || o.is_voided === "true";

    let status;
    if (isRefunded) status = "refunded";
    else if (isVoided) status = "failed";
    else if (success && !isError) status = "succeeded";
    else status = "failed";

    const orderId = o.order && o.order.id ? String(o.order.id) : String(o.order_id || "");
    const merchantOrderId =
      (o.order && o.order.merchant_order_id) || o.merchant_order_id || "";

    return {
      status,
      bookingId: merchantOrderId || orderId,
      providerRef: orderId,
      amountCents: Number(o.amount_cents || 0),
      currency: o.currency || "",
      last4: (o.source_data && o.source_data.pan) || null,
      method: (o.source_data && o.source_data.type) || null,
      transactionId: o.id ? String(o.id) : null
    };
  },

  async refund({ providerRef, amount, currency, transactionId }) {
    const apiKey = required("PAYMOB_API_KEY");
    if (!transactionId) throw new Error("paymob_refund_requires_txn_id");
    const res = await postJson("/api/acceptance/void_refund/refund", {
      api_key: apiKey,
      transaction_id: Number(transactionId)
    });
    if (!res || res.id == null) throw new Error("paymob_refund_failed");
    return { ok: true, refundId: res.id };
  }
};

const HMAC_FIELDS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type"
];

function dig(obj, path) {
  return path.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

function computeHmac(obj, secret) {
  const inner = obj.obj || obj;
  let concatenated = "";
  for (const f of HMAC_FIELDS) {
    let v = dig(inner, f);
    if (v === undefined || v === null) v = "";
    concatenated += String(v);
  }
  return crypto.createHmac("sha512", secret).update(concatenated).digest("hex");
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = paymob;
module.exports.computeHmac = computeHmac;
module.exports.toCents = toCents;
