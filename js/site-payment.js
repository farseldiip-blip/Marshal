/* =========================================================
   site-payment.js — Frontend payment CLIENT layer.
   ---------------------------------------------------------
   SECURITY CONTRACT (enforced here, never violated):
   - No provider secret keys are stored or used in this file.
   - It NEVER calls the provider's secret API directly.
   - It NEVER sets paymentStatus = "Paid" or booking status =
     "Confirmed" from a client-side callback.
   - It NEVER writes to the `payments` table.
   - It only: (1) asks the backend to create a payment, (2) opens
     the provider's HOSTED page with a safe client token, (3) treats
     the return as "processing", (4) waits for the backend/webhook
     to flip the booking's paymentStatus (read-only poll).

   Config (public only, NO secrets):
     window.MGPaymentConfig = {
       endpoint: "http://localhost:8080/api",  // backend base URL
       returnUrl: location.href,
       provider: "paymob"
     }
   ========================================================= */
(function () {
  "use strict";

  function cfg() {
    return window.MGPaymentConfig || { endpoint: "", returnUrl: location.href, provider: "paymob" };
  }
  // shared.js is always loaded before this file (verified in all HTML pages).
  var t = MGShared.t;
  var esc = MGShared.esc;

  function setArea(el, kind, msg) {
    if (!el) return;
    el.hidden = false;
    el.className = "booking-msg " + (kind ? "booking-msg--" + kind : "");
    el.textContent = msg;
  }

  // Poll the booking via REST until the backend flips paymentStatus.
  // This is READ-ONLY verification; the backend/webhook is the source.
  async function waitForVerified(bookingId, timeoutMs) {
    timeoutMs = timeoutMs || 60000;
    var start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        // Use MGBooking.getBookingById (REST in live, localStorage in demo).
        // We need the accessToken for the live path; get it from memory.
        var accessToken = "";
        if (window.__mgCurrentBooking && window.__mgCurrentBooking.id === bookingId) {
          accessToken = window.__mgCurrentBooking.accessToken || "";
        }
        var b = null;
        if (window.MGBooking && window.MGBooking.getBookingById) {
          b = await window.MGBooking.getBookingById(bookingId, accessToken);
        } else if (window.MGSiteData) {
          var all = await window.MGSiteData.getList("bookings");
          for (var i = 0; i < (all || []).length; i++) {
            if (all[i].id === bookingId) { b = all[i]; break; }
          }
        }
        var ps = b && (b.paymentStatus || "Unpaid");
        if (ps === "Paid" || ps === "PAID") return { ok: true };
        if (ps === "Failed" || ps === "FAILED") return { ok: false, reason: "failed" };
        if (ps === "Refunded" || ps === "REFUNDED") return { ok: false, reason: "refunded" };
      } catch (e) { /* keep polling */ }
      await new Promise(function (r) { setTimeout(r, 2000); });
    }
    return { ok: false, reason: "timeout" };
  }

  // ---- Public API: initiate payment for an already-created Pending booking.
  async function payBooking(booking, opts) {
    opts = opts || {};
    var area = opts.area;
    var onState = opts.onState || function () {};

    if (!booking || !booking.id) { setArea(area, "error", t("pay_err", "Missing booking information.", "معلومات الحجز غير متوفرة.")); return { ok: false }; }
    var c = cfg();

    // No backend endpoint configured. Online payment is intentionally disabled.
    if (!c.endpoint) {
      onState("unavailable");
      setArea(area, "error", t("pay_unavailable",
        "Online payment is currently unavailable. Your booking remains Pending / Unpaid.",
        "الدفع عبر الإنترنت غير متاح حالياً. يبقى حجزك قيد الانتظار / غير مدفوع."));
      return { ok: false, unavailable: true };
    }

    onState("processing");
    setArea(area, "", t("pay_processing", "Initializing secure payment…", "جارٍ تهيئة الدفع الآمن…"));

    // 1) Ask the BACKEND to create the payment.
    //    Backend only needs bookingId + accessToken; it computes amount server-side.
    var res;
    try {
      var resp = await fetch(c.endpoint + "/payments/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          accessToken: booking.accessToken || ""
        })
      });
      res = await resp.json().catch(function () { return {}; });
      if (!resp.ok || !res || !res.ok) {
        var msg = (res && res.error && res.error.message) || "";
        setArea(area, "error", t("pay_error", "Could not start payment. Please try again.", "تعذّر بدء الدفع. يرجى المحاولة لاحقًا.") + (msg ? " (" + esc(msg) + ")" : ""));
        onState("error");
        return { ok: false };
      }
    } catch (e) {
      setArea(area, "error", t("pay_error", "Could not start payment. Please try again.", "تعذّر بدء الدفع. يرجى المحاولة لاحقًا."));
      onState("error");
      return { ok: false };
    }

    // 2) Open the provider's HOSTED page with the safe client token/session.
    var checkoutUrl = res.checkoutUrl || res.clientToken || null;
    if (checkoutUrl) {
      setArea(area, "", t("pay_redirect", "Redirecting to secure payment…", "جارٍ التحويل إلى صفحة الدفع الآمنة…"));
      window.location.href = checkoutUrl;
      return { ok: true, redirected: true };
    }

    // 3) If backend returns verified state immediately (test mode), poll.
    if (res.poll !== false) {
      setArea(area, "", t("pay_verify", "Verifying payment…", "جارٍ التحقق من الدفع…"));
      var v = await waitForVerified(booking.id, res.pollTimeoutMs);
      if (v.ok) { setArea(area, "ok", t("pay_success", "Payment successful. Your booking is confirmed.", "تم الدفع بنجاح وتأكد حجزك.")); onState("success"); }
      else if (v.reason === "failed") { setArea(area, "error", t("pay_failed", "Payment failed. Please try again.", "فشل الدفع. يرجى المحاولة.")); onState("failed"); }
      else { setArea(area, "error", t("pay_pending", "Payment is still processing. We'll confirm by email/SMS.", "الدفع قيد المعالجة. سنتأكد لك لاحقًا.")); onState("pending"); }
      return v;
    }
    return { ok: true };
  }

  // ---- Wire a "Pay now" button into the booking-confirm panel.
  function bindConfirmPanel() {
    var confirmMsg = document.getElementById("bkConfirmMsg");
    var panel = document.getElementById("bkResult");
    if (!confirmMsg || !panel) return;

    // Extract booking reference from the confirm message.
    // Matches both cuid format (cmrtmtoz...) and demo format (pb_123...).
    var mo = confirmMsg.textContent.match(/Reference:\s*(.+?)\s/);
    if (!mo) return;
    var bookingId = mo[1];
    if (panel.querySelector("#bkPayNow")) return;

    // Check payment status — don't show button if already paid.
    var current = (window.__mgCurrentBooking && window.__mgCurrentBooking.id === bookingId)
      ? window.__mgCurrentBooking : null;
    if (current && (current.paymentStatus === "Paid" || current.paymentStatus === "PAID")) {
      return;
    }

    // Format button label with amount and currency from hotel settings.
    var btnLabel = t("pay_now", "Pay now", "ادفع الآن");
    var total = current ? current.total : null;
    if (total != null && window.MGSettings && MGSettings.formatMoney) {
      btnLabel += " \u2014 " + MGSettings.formatMoney(total);
    }

    var btn = document.createElement("button");
    btn.id = "bkPayNow";
    btn.className = "btn btn--gold";
    btn.style.marginTop = "0.9rem";
    btn.textContent = btnLabel;
    btn.addEventListener("click", async function () {
      // Prefer the in-memory booking (carries the server-issued accessToken).
      var b = (window.__mgCurrentBooking && window.__mgCurrentBooking.id === bookingId)
        ? window.__mgCurrentBooking
        : null;
      if (!b && window.MGBooking && window.MGBooking.getBookingById) {
        b = await window.MGBooking.getBookingById(bookingId, "");
      }
      if (!b) {
        var all = (await (window.MGSiteData
          ? window.MGSiteData.getList("bookings")
          : (window.__mgSeed ? window.__mgSeed().bookings : []))) || [];
        for (var i = 0; i < all.length; i++) {
          if (all[i].id === bookingId) { b = all[i]; break; }
        }
      }
      if (!b) {
        btn.disabled = false; btn.textContent = btnLabel;
        return;
      }
      // Re-check: don't pay if already paid.
      if (b.paymentStatus === "Paid" || b.paymentStatus === "PAID") {
        btn.textContent = t("pay_success_short", "Payment confirmed", "تم تأكيد الدفع");
        return;
      }
      var area = document.getElementById("bkPayArea") || (function () {
        var d = document.createElement("div");
        d.id = "bkPayArea"; d.className = "booking-result"; d.hidden = true;
        panel.appendChild(d); return d;
      })();
      btn.disabled = true; btn.textContent = t("pay_processing", "Initializing secure payment…", "جارٍ تهيئة الدفع الآمن…");
      var result = await payBooking(b, { area: area, onState: function () {} });
      if (!result || !result.redirected) {
        btn.disabled = false; btn.textContent = btnLabel;
      }
    });
    panel.appendChild(btn);
  }

  // If we returned from the provider (returnUrl), show "processing" and poll.
  function handleReturn() {
    var p = new URLSearchParams(location.search);
    var ref = p.get("booking");
    if (!ref) return;
    var area = document.getElementById("bkPayArea");
    setArea(area, "", t("pay_verify", "Verifying payment…", "جارٍ التحقق من الدفع…"));
    waitForVerified(ref, 90000).then(function (v) {
      if (v.ok) setArea(area, "ok", t("pay_success", "Payment successful. Your booking is confirmed.", "تم الدفع بنجاح وتأكد حجزك."));
      else if (v.reason === "failed") setArea(area, "error", t("pay_failed", "Payment failed. Please try again.", "فشل الدفع. يرجى المحاولة."));
      else setArea(area, "error", t("pay_pending", "Payment is still processing. We'll confirm by email/SMS.", "الدفع قيد المعالجة. سنتأكد لك لاحقًا."));
    });
  }

  function init() {
    var tries = 0, timer = null;
    var tryBind = function () {
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

  window.MGPayment = { payBooking: payBooking, waitForVerified: waitForVerified, bindConfirmPanel: bindConfirmPanel };
})();
