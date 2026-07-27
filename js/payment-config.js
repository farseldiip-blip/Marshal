/* =========================================================
   payment-config.js — PUBLIC-ONLY payment configuration.
   ---------------------------------------------------------
   SECURITY: this file holds NO secrets. Only the backend base
   URL and the (non-sensitive) provider name live here. The
   provider secret keys / webhook signatures live ONLY in the
   Cloud Functions environment (functions/.env / secret manager).

   To enable payments, set `endpoint` to your deployed
   functions URL. Leave blank/undefined to keep the client in
   "no backend" mode (buttons are inert / show a notice).
   ========================================================= */
window.MGPaymentConfig = {
  // Base URL of the backend that hosts the Cloud Functions.
  // e.g. "https://us-central1-marshal-gezira.cloudfunctions.net"
  endpoint: "http://localhost:8080/api",

  // Where the provider should return the user after paying.
  returnUrl: location.href,

  // Informational only (the real routing is server-side).
  provider: "paymob" // or "stripe"
};
