/* =========================================================
   site-payment.js — Frontend payment CLIENT layer.
   ---------------------------------------------------------
   SECURITY CONTRACT (enforced here, never violated):
   - No provider secret keys are stored or used in this file.
   - It NEVER calls the provider's secret API directly.
   - It NEVER sets paymentStatus = "Paid" or booking status =
     "Confirmed" from a client-side callback.
   - It NEVER writes to the `payments` collection.
   - It only: (1) asks the backend to create a payment, (2) opens
     the provider's HOSTED page with a safe client token, (3) treats
     the return as "processing", (4) waits for the backend/webhook
     to flip the booking's paymentStatus (read-only poll).

   The backend (Cloud Functions) is the ONLY authority on payment
   truth. See functions/ for the stubs.

   Config (public only, NO secrets):
     window.MGPaymentConfig = {
       endpoint: "/api",          // backend base URL (functions host)
       returnUrl: location.href,     // where provider returns to
       provider: "paymob" | "stripe" (informational only)
     }
   ========================================================= */
(function () {
  "use strict";

  function cfg() {
    return window.MGPaymentConfig || { endpoint: "", returnUrl: location.href, provider: "paymob" };
  }
  function t(key, en, ar) {
    const lang = window.MGLang && window.MGLang.get && window.MGLang.get();
    return lang === "ar" ? (ar || en) : en;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function setArea(el, kind, msg) {
    if (!el) return;
    el.hidden = false;
    el.className = "booking-msg " + (kind ? "booking-msg--" + kind : "");
    el.textContent = msg;
  }

  // Poll the shared data layer until the backend flips paymentStatus.
  // This is READ-ONLY verification; the backend/webhook is the source.
  async function waitForVerified(bookingId, timeoutMs) {
    timeoutMs = timeoutMs || 60000;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const all = (await (window.MGSiteData
          ? window.MGSiteData.getList("bookings")
          : (window.__mgSeed ? window.__mgSeed().bookings : []))) || [];
        const b = all.find(x => x.id === bookingId);
        const ps = b && (b.paymentStatus || "Unpaid");
        if (ps === "Paid") return { ok: true };
        if (ps === "Failed") return { ok: false, reason: "failed" };
        if (ps === "Refunded") return { ok: false, reason: "refunded" };
      } catch (e) { /* keep polling */ }
      await new Promise(r => setTimeout(r, 2000));
    }
    return { ok: false, reason: "timeout" };
  }

  // ---- Public API: initiate payment for an already-created Pending booking.
  async function payBooking(booking, opts) {
    opts = opts || {};
    const area = opts.area;          // element to show status in
    const onState = opts.onState || function () {};

    if (!booking || !booking.id) { setArea(area, "error", t("pay_err", "Missing booking information.", "معلومات الحجز غير متوفرة.")); return { ok: false }; }
    const c = cfg();

    onState("processing");
    setArea(area, "", t("pay_processing", "Initializing secure payment…", "جارٍ تهيئة الدفع الآمن…"));

    // 1) Ask the BACKEND to create the payment (secret handled server-side).
    let res;
    try {
      const resp = await fetch((c.endpoint || "/api") + "/createPaymentIntent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send ONLY what the backend needs to validate + charge.
        // accessToken proves ownership WITHOUT Firebase Auth; it is held
        // in memory for this session and is NEVER put in the URL/HTML.
        body: JSON.stringify({
          bookingId: booking.id,
          accessToken: booking.accessToken || "",
          amount: booking.total != null ? booking.total : booking.revenue,
          currency: (booking.currency) || "USD",
          email: booking.email || "",
          returnUrl: c.returnUrl
        })
      });
      res = await resp.json().catch(() => ({}));
      if (!resp.ok || !res || !res.ok) {
        setArea(area, "error", t("pay_error", "Could not start payment. Please try again.", "تعذّر بدء الدفع. يرجى المحاولة لاحقًا."));
        onState("error");
        return { ok: false };
      }
    } catch (e) {
      setArea(area, "error", t("pay_error", "Could not start payment. Please try again.", "تعذّر بدء الدفع. يرجى المحاولة لاحقًا."));
      onState("error");
      return { ok: false };
    }

    // 2) Open the provider's HOSTED page with the safe client token/session.
    //    We never see or use a secret key here.
    const checkoutUrl = res.checkoutUrl || res.clientToken || null;
    if (checkoutUrl) {
      setArea(area, "", t("pay_redirect", "Redirecting to secure payment…", "جارٍ التحويل إلى صفحة الدفع الآمنة…"));
      window.location.href = checkoutUrl; // provider-hosted; return url brings us back
      return { ok: true, redirected: true };
    }

    // 3) If backend returns verified state immediately (e.g. test mode w/ webhook
    //    already fired), poll our read-only view for confirmation.
    if (res.poll !== false) {
      setArea(area, "", t("pay_verify", "Verifying payment…", "جارٍ التحقق من الدفع…"));
      const v = await waitForVerified(booking.id, res.pollTimeoutMs);
      if (v.ok) { setArea(area, "ok", t("pay_success", "Payment successful. Your booking is confirmed.", "تم الدفع بنجاح وتأكد حجزك.")); onState("success"); }
      else if (v.reason === "failed") { setArea(area, "error", t("pay_failed", "Payment failed. Please try again.", "فشل الدفع. يرجى المحاولة.")); onState("failed"); }
      else { setArea(area, "error", t("pay_pending", "Payment is still processing. We'll confirm by email/SMS.", "الدفع قيد المعالجة. سنتأكد لك لاحقًا.")); onState("pending"); }
      return v;
    }
    return { ok: true };
  }

  // ---- Wire a "Pay now" button into the booking-confirm panel (no redesign).
  function bindConfirmPanel() {
    const confirmMsg = document.getElementById("bkConfirmMsg");
    const panel = document.getElementById("bkResult");
    if (!confirmMsg || !panel) return;
    // Only act once the confirm message shows a reference (booking created).
    const mo = confirmMsg.textContent.match(/pb_\d+/);
    if (!mo) return;
    const bookingId = mo[0];
    if (panel.querySelector("#bkPayNow")) return; // already bound

    const btn = document.createElement("button");
    btn.id = "bkPayNow";
    btn.className = "btn btn--gold";
    btn.style.marginTop = "0.9rem";
    btn.textContent = t("pay_now", "Pay now", "ادفع الآن");
     btn.addEventListener("click", async () => {
      // Prefer the in-memory booking (carries the server-issued
      // accessToken for this session). Fall back to a fresh lookup
      // that also carries the token when available.
      let b = (window.__mgCurrentBooking && window.__mgCurrentBooking.id === bookingId)
        ? window.__mgCurrentBooking
        : null;
      if (!b) {
        const all = (await (window.MGSiteData
          ? window.MGSiteData.getList("bookings")
          : (window.__mgSeed ? window.__mgSeed().bookings : []))) || [];
        b = all.find(x => x.id === bookingId);
      }
      const area = document.getElementById("bkPayArea") || (() => {
        const d = document.createElement("div");
        d.id = "bkPayArea"; d.className = "booking-result"; d.hidden = true;
        panel.appendChild(d); return d;
      })();
      btn.disabled = true; btn.textContent = t("pay_processing", "Initializing secure payment…", "جارٍ تهيئة الدفع الآمن…");
      await payBooking(b, { area, onState: () => {} });
      btn.disabled = false; btn.textContent = t("pay_now", "Pay now", "ادفع الآن");
    });
    panel.appendChild(btn);
  }

  // If we returned from the provider (returnUrl), show "processing" and poll.
  function handleReturn() {
    const p = new URLSearchParams(location.search);
    const ref = p.get("booking");
    if (!ref) return;
    const area = document.getElementById("bkPayArea");
    setArea(area, "", t("pay_verify", "Verifying payment…", "جارٍ التحقق من الدفع…"));
    waitForVerified(ref, 90000).then(v => {
      if (v.ok) setArea(area, "ok", t("pay_success", "Payment successful. Your booking is confirmed.", "تم الدفع بنجاح وتأكد حجزك."));
      else if (v.reason === "failed") setArea(area, "error", t("pay_failed", "Payment failed. Please try again.", "فشل الدفع. يرجى المحاولة."));
      else setArea(area, "error", t("pay_pending", "Payment is still processing. We'll confirm by email/SMS.", "الدفع قيد المعالجة. سنتأكد لك لاحقًا."));
    });
  }

  function init() {
    // Bind the "Pay now" button into the confirm panel once the
    // booking reference appears. Poll briefly (same pattern as the
    // Swiper retry in booking.js) — robust across script load order.
    let tries = 0, timer = null;
    const tryBind = () => {
      try { bindConfirmPanel(); } catch (e) {}
      if (document.getElementById("bkPayNow")) { if (timer) clearInterval(timer); return; }
      if (++tries > 40 && timer) clearInterval(timer);
    };
    tryBind();
    timer = setInterval(tryBind, 150);
    handleReturn();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.MGPayment = { payBooking, waitForVerified };
})();
