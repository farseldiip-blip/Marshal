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
    //    Only real hosted providers (e.g. Paymob) navigate away. Demo intent
    //    returns checkoutUrl=null + demo:true and stays in the page.
    var checkoutUrl = res.checkoutUrl || res.clientToken || null;
    var demoMode = res.demo === true || res.mode === "demo";
    if (checkoutUrl && !demoMode) {
      setArea(area, "", t("pay_redirect", "Redirecting to secure payment…", "جارٍ التحويل إلى صفحة الدفع الآمنة…"));
      window.location.href = checkoutUrl;
      return { ok: true, redirected: true };
    }

    // 3) Demo payments never leave the page: prefer the in-page payment modal.
    if (typeof pmOpen === "function") {
      pmOpen(booking);
      onState("processing");
      return { ok: true, modal: true };
    }

    // 4) Last-resort fallback (no modal): hosted demo-checkout page built on the
    //    real app base path (works locally AND on GitHub Pages under /Marshal/).
    if (checkoutUrl || res.txnId) {
      setArea(area, "", t("pay_redirect", "Redirecting to secure payment…", "جارٍ التحويل إلى صفحة الدفع الآمنة…"));
      window.location.href = demoCheckoutUrl(booking.id, res.txnId, booking.accessToken || "");
      return { ok: true, redirected: true };
    }

    // 5) If backend returns verified state immediately (test mode), poll.
    if (res.poll !== false) {
      setArea(area, "", t("pay_verify", "Verifying payment…", "جارٍ التحقق من الدفع…"));
      var v = await waitForVerified(booking.id, res.pollTimeoutMs);
      if (v.ok) { setArea(area, "ok", t("pay_success", "Payment successful. Your booking is confirmed.", "تم الدفع بنجاح وتأكد حجزك.")); onState("success"); document.dispatchEvent(new CustomEvent("avail:refresh")); }
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
      pmOpen(b);
    });
    panel.appendChild(btn);
  }

  /* =========================================================
     Demo Payment Modal (in-page, premium).
     Opens automatically after a successful booking and lets
     the guest pay through the existing backend demo endpoints:
       POST {base}/payments/create-intent  → creates session, returns txnId
       POST {base}/payments/demo/confirm   → marks paymentStatus=PAID
     Never creates a second booking. Never uses alert()/prompt().
     ========================================================= */
  var _pm = { modal: null, booking: null, paying: false, paid: false, bound: false };

  function pmEl(id) { return _pm.modal ? _pm.modal.querySelector(id) : null; }

  function pmBase() {
    var c = cfg();
    return c.endpoint || (window.MGApiConfig && window.MGApiConfig.baseUrl) || "";
  }

  // Robust application base path derived from the CURRENT location. Never
  // hardcodes the root domain, so it works locally (http://localhost:5500/)
  // AND on GitHub Pages project sites (https://farseldiip-blip.github.io/Marshal/).
  function appBase() {
    var origin = window.location.origin;
    var path = (window.location.pathname || "/").replace(/\\/g, "/");
    var dir = path;
    var li = dir.lastIndexOf("/");
    if (li > 0) dir = dir.substring(0, li);
    else dir = "";
    if (!dir.endsWith("/")) dir += "/";
    // Pages served from a /pages/ subfolder live one level below the app root.
    if (/\/pages\/$/.test(dir)) dir = dir.replace(/\/pages\/$/, "/");
    return origin + dir;
  }

  // Fallback hosted checkout URL (demo-checkout.html) built on the app base path.
  function demoCheckoutUrl(bookingId, txnId, accessToken) {
    var u = appBase() + "demo-checkout.html?bookingId=" + encodeURIComponent(bookingId)
      + "&txnId=" + encodeURIComponent(txnId || "");
    if (accessToken) u += "&accessToken=" + encodeURIComponent(accessToken);
    return u;
  }

  function pmMoney(n) {
    if (window.MGSettings && MGSettings.formatMoney) return MGSettings.formatMoney(n);
    if (MGShared.money) return MGShared.money(n);
    return n;
  }

  function pmDate(v) {
    if (!v) return "\u2014";
    var d = new Date(String(v).length === 10 ? v + "T00:00:00" : v);
    if (isNaN(d.getTime())) return v;
    var locale = (document.documentElement.lang === "ar") ? "ar-EG" : "en-GB";
    return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  }

  function pmBuild() {
    if (_pm.modal && document.body.contains(_pm.modal)) return _pm.modal;
    var wrap = document.createElement("div");
    wrap.id = "payment-modal";
    wrap.className = "payment-modal";
    wrap.setAttribute("data-payment", "");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", "pmTitle");
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="payment-modal__backdrop" data-pm-backdrop></div>' +
      '<div class="payment-modal__box" role="document">' +
        '<button class="payment-modal__close" type="button" data-pm-x aria-label="' + esc(t("pm_close", "Close", "إغلاق")) + '">&times;</button>' +
        '<div class="payment-modal__body" id="pmBody">' +
          '<span class="payment-modal__badge">' + esc(t("pm_badge", "Demo Payment", "دفع تجريبي")) + '</span>' +
          '<h3 class="payment-modal__title" id="pmTitle">' + esc(t("pm_title", "Secure Checkout", "الدفع الآمن")) + '</h3>' +
          '<p class="payment-modal__sub">' + esc(t("pm_sub", "This is a simulated payment for development testing. No real money is charged.", "هذه محاكاة دفع لأغراض التطوير. لا يتم خصم أي أموال حقيقية.")) + '</p>' +
          '<div class="payment-modal__details">' +
            '<div class="payment-modal__row"><span class="payment-modal__label">' + esc(t("pm_ref", "Booking Reference", "مرجع الحجز")) + '</span><span class="payment-modal__value" id="pmRef">\u2014</span></div>' +
            '<div class="payment-modal__row"><span class="payment-modal__label">' + esc(t("pm_room", "Room", "الغرفة")) + '</span><span class="payment-modal__value" id="pmRoom">\u2014</span></div>' +
            '<div class="payment-modal__row"><span class="payment-modal__label">' + esc(t("pm_checkin", "Check-in", "تاريخ الدخول")) + '</span><span class="payment-modal__value" id="pmCheckin">\u2014</span></div>' +
            '<div class="payment-modal__row"><span class="payment-modal__label">' + esc(t("pm_checkout", "Check-out", "تاريخ الخروج")) + '</span><span class="payment-modal__value" id="pmCheckout">\u2014</span></div>' +
            '<div class="payment-modal__row"><span class="payment-modal__label">' + esc(t("pm_nights", "Nights", "الليالي")) + '</span><span class="payment-modal__value" id="pmNights">\u2014</span></div>' +
            '<div class="payment-modal__row"><span class="payment-modal__label">' + esc(t("pm_status", "Payment Status", "حالة الدفع")) + '</span><span class="payment-modal__value" id="pmStatus">\u2014</span></div>' +
            '<div class="payment-modal__row payment-modal__row--total"><span class="payment-modal__label">' + esc(t("pm_total", "Total", "الإجمالي")) + '</span><span class="payment-modal__value payment-modal__total" id="pmTotal">\u2014</span></div>' +
          '</div>' +
          '<div class="payment-modal__status" id="pmMsg" hidden></div>' +
          '<div class="payment-modal__actions" id="pmActions">' +
            '<button class="btn btn--outline payment-modal__btn payment-modal__btn--secondary" type="button" id="pmPayLater">' + esc(t("pm_paylater", "Pay Later", "ادفع لاحقًا")) + '</button>' +
            '<button class="btn btn--gold payment-modal__btn payment-modal__btn--pay" type="button" id="pmPayNow">' +
              '<svg class="payment-modal__lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>' +
              '<span class="payment-modal__label">' + esc(t("pm_paynow", "Pay Now", "ادفع الآن")) + '</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="payment-modal__success" id="pmSuccess" hidden>' +
          '<div class="payment-modal__check" aria-hidden="true">&#10003;</div>' +
          '<h3 class="payment-modal__title">' + esc(t("pm_done_title", "Payment Confirmed", "تم تأكيد الدفع")) + '</h3>' +
          '<p class="payment-modal__sub">' + esc(t("pm_done_sub", "Your booking is confirmed and secured.", "تم تأكيد حجزك وتأمينه.")) + '</p>' +
          '<div class="payment-modal__ref"><span class="payment-modal__label">' + esc(t("pm_ref", "Booking Reference", "مرجع الحجز")) + '</span><strong id="pmSuccessRef">\u2014</strong></div>' +
          '<button class="btn btn--primary payment-modal__btn" type="button" id="pmDone">' + esc(t("pm_done", "Done", "تم")) + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(wrap);
    _pm.modal = wrap;

    if (!_pm.bound) {
      _pm.bound = true;
      var backdrop = wrap.querySelector("[data-pm-backdrop]");
      var closeX = wrap.querySelector("[data-pm-x]");
      if (backdrop) backdrop.addEventListener("click", function () { pmClose(); });
      if (closeX) closeX.addEventListener("click", function () { pmClose(); });
      var payNow = wrap.querySelector("#pmPayNow");
      var payLater = wrap.querySelector("#pmPayLater");
      var done = wrap.querySelector("#pmDone");
      if (payNow) payNow.addEventListener("click", pmPay);
      if (payLater) payLater.addEventListener("click", function () { pmClose(); });
      if (done) done.addEventListener("click", function () { pmClose(); });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && _pm.modal && !_pm.modal.hidden) pmClose();
      });
    }
    return wrap;
  }

  function pmMsg(kind, msg) {
    var el = pmEl("#pmMsg");
    if (!el) return;
    el.hidden = false;
    el.className = "payment-modal__status" + (kind === "error" ? " payment-modal__status--error" : "");
    el.textContent = msg;
  }

  // Set the Pay Now label without clobbering the lock icon / label span.
  function pmSetPayLabel(btn, label) {
    if (!btn) return;
    var labelEl = btn.querySelector(".payment-modal__label");
    if (labelEl) labelEl.textContent = label;
    else btn.textContent = label;
  }

  function pmRender(b) {
    if (!b) return;
    pmEl("#pmRef").textContent = b.id || "\u2014";
    pmEl("#pmRoom").textContent = b.roomName || b.room || b.roomType || "\u2014";
    pmEl("#pmCheckin").textContent = pmDate(b.checkin || b.checkIn);
    pmEl("#pmCheckout").textContent = pmDate(b.checkout || b.checkOut);
    pmEl("#pmNights").textContent = (b.nights != null) ? String(b.nights) : "\u2014";
    pmEl("#pmTotal").textContent = pmMoney(b.total);
    var ps = b.paymentStatus || "Unpaid";
    var statusEl = pmEl("#pmStatus");
    if (statusEl) {
      statusEl.textContent = ps;
      statusEl.className = "payment-modal__value tag tag-" + ps;
    }
    var payBtn = pmEl("#pmPayNow");
    if (payBtn) {
      var label = t("pm_paynow", "Pay Now", "ادفع الآن");
      if (b.total != null) label += " \u2014 " + pmMoney(b.total);
      pmSetPayLabel(payBtn, label);
      payBtn.disabled = false;
      payBtn.classList.remove("btn--loading");
    }
    var laterBtn = pmEl("#pmPayLater");
    if (laterBtn) laterBtn.disabled = false;
  }

  function pmShowSuccess(b) {
    document.dispatchEvent(new CustomEvent("avail:refresh"));
    _pm.paid = true;
    var body = pmEl("#pmBody");
    var succ = pmEl("#pmSuccess");
    if (body) body.hidden = true;
    if (succ) {
      var ref = pmEl("#pmSuccessRef");
      if (ref) ref.textContent = (b && b.id) || "\u2014";
      succ.hidden = false;
    }
  }

  function pmOpen(booking) {
    var modal = pmBuild();
    _pm.booking = booking || (window.__mgCurrentBooking || null);
    _pm.paying = false;
    _pm.paid = false;
    var b = _pm.booking;
    if (!b) return;

    var body = pmEl("#pmBody");
    var succ = pmEl("#pmSuccess");
    if (body) body.hidden = false;
    if (succ) succ.hidden = true;
    var msg = pmEl("#pmMsg");
    if (msg) msg.hidden = true;

    pmRender(b);
    if (/^paid$/i.test(String(b.paymentStatus || ""))) {
      pmShowSuccess(b);
    }

    modal.hidden = false;
    document.body.style.overflow = "hidden";
    var payBtn = pmEl("#pmPayNow");
    if (payBtn) setTimeout(function () { if (payBtn) payBtn.focus({ preventScroll: true }); }, 60);
  }

  function pmClose() {
    if (_pm.modal) _pm.modal.hidden = true;
    document.body.style.overflow = "";
    _pm.paying = false;
  }

  async function pmPay() {
    var b = _pm.booking;
    if (!b || _pm.paying || _pm.paid) return;
    var base = pmBase();
    if (!base) {
      pmMsg("error", t("pm_no_cfg", "Payment is temporarily unavailable. Your booking is saved.", "الدفع غير متاح مؤقتًا. تم حفظ حجزك."));
      return;
    }

    _pm.paying = true;
    var payBtn = pmEl("#pmPayNow");
    var laterBtn = pmEl("#pmPayLater");
    if (payBtn) {
      payBtn.disabled = true;
      payBtn.classList.add("btn--loading");
      payBtn.setAttribute("aria-busy", "true");
      pmSetPayLabel(payBtn, t("pm_processing", "Processing payment\u2026", "جارٍ معالجة الدفع…"));
    }
    if (laterBtn) laterBtn.disabled = true;
    pmMsg("", t("pm_connecting", "Connecting to secure payment\u2026", "جارٍ الاتصال بالدفع الآمن…"));

    try {
      // 1) Create the payment session via the existing backend endpoint.
      var resp = await fetch(base + "/payments/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ bookingId: b.id, accessToken: b.accessToken || "" })
      });
      var intent = await resp.json().catch(function () { return {}; });
      if (!resp.ok || !intent || !intent.ok) {
        throw new Error((intent && intent.error && intent.error.message) || "intent_failed");
      }

      // 2) Confirm via the existing demo endpoint (sets paymentStatus=PAID server-side).
      var txnId = intent.txnId;
      var checkoutUrl = intent.checkoutUrl || null;
      var demoMode = intent.demo === true || intent.mode === "demo";
      var confirmResp, confirmJson;
      try {
        confirmResp = await fetch(base + "/payments/demo/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ bookingId: b.id, txnId: txnId, accessToken: b.accessToken || "" })
        });
        confirmJson = await confirmResp.json().catch(function () { return {}; });
      } catch (e) {
        confirmJson = null;
      }

      // Fallback: if the backend exposes a hosted checkout page and the
      // demo-confirm endpoint is not available, open it in a new tab.
      // Demo URLs are rebuilt on the app base path (fixes the GitHub Pages
      // /Marshal/ 404); hosted provider URLs (Paymob) are used as returned.
      if (!confirmJson || !confirmJson.ok || confirmResp.status === 404) {
        var fallbackUrl = demoMode ? demoCheckoutUrl(b.id, txnId, b.accessToken || "") : (checkoutUrl || null);
        if (fallbackUrl) {
          pmMsg("", t("pm_redirect", "Redirecting to secure payment\u2026", "جارٍ التحويل إلى صفحة الدفع الآمنة…"));
          window.open(fallbackUrl, "_blank", "noopener");
          return;
        }
        throw new Error((confirmJson && confirmJson.error && confirmJson.error.message) || "confirm_failed");
      }

      // 3) Reflect the paid state on the in-memory booking.
      if (window.__mgCurrentBooking && window.__mgCurrentBooking.id === b.id) {
        window.__mgCurrentBooking.paymentStatus = "Paid";
        window.__mgCurrentBooking.status = "Confirmed";
      }
      _pm.paying = false;
      pmShowSuccess(b);
    } catch (e) {
      _pm.paying = false;
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.classList.remove("btn--loading");
        payBtn.removeAttribute("aria-busy");
        var label = t("pm_paynow", "Pay Now", "ادفع الآن");
        if (b.total != null) label += " \u2014 " + pmMoney(b.total);
        pmSetPayLabel(payBtn, label);
      }
      if (laterBtn) laterBtn.disabled = false;
      pmMsg("error", t("pm_failed", "Payment could not be completed: ", "تعذّر إتمام الدفع: ") + (e && e.message ? e.message : ""));
    }
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

  window.MGPayment = {
    payBooking: payBooking,
    waitForVerified: waitForVerified,
    bindConfirmPanel: bindConfirmPanel,
    openModal: pmOpen,
    closeModal: pmClose
  };
})();
