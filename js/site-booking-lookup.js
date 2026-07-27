/* =========================================================
   site-booking-lookup.js — Public "My Booking" lookup.
   ---------------------------------------------------------
   Secure, read-only guest lookup using REST POST
   /api/bookings/lookup (backend validates reference + contact
   match atomically; no raw list is exposed to the client).

   Rules:
   - Reference is required AND at least one contact (email|phone)
     must match the booking. Reference alone reveals nothing.
   - On any mismatch -> generic "not found", no indication
     whether the reference exists.
   - Read-only: no edit / cancel / delete.
   ========================================================= */
(function () {
  "use strict";

  var t = (window.MGShared && MGShared.t) || function (key, en, ar) {
    var lang = window.MGLang && window.MGLang.get && window.MGLang.get();
    return lang === "ar" ? (ar || en) : en;
  };
  var esc = (window.MGShared && MGShared.esc) || function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]);
    });
  };
  var money = (window.MGShared && MGShared.money) || function (n) { return (window.MGSettings ? MGSettings.formatMoney(n) : new Intl.NumberFormat("en-US", { style: "currency", currency: (window.MGSettings && MGSettings.getCurrency) ? MGSettings.getCurrency() : "USD", currencyDisplay: "symbol", minimumFractionDigits: 2 }).format(Number(n || 0))); };
  var normalizeBooking = (window.MGShared && MGShared.normalizeBooking) || function (b) { return b; };

  function statusClass(s) {
    return { "Checked In": "tag-CheckedIn", "Checked Out": "tag-CheckedOut" }[s] || ("tag-" + s);
  }
  function payClass(p) {
    if (p === "Paid") return "tag-Paid";
    if (p === "Unpaid") return "tag-Unpaid";
    return "tag-" + (p || "Unpaid");
  }

  /* ---------- REST lookup ---------- */
  async function lookup() {
    var refEl = document.getElementById("lkRef");
    var emailEl = document.getElementById("lkEmail");
    var phoneEl = document.getElementById("lkPhone");
    var states = document.getElementById("lkStates");
    var result = document.getElementById("lkResult");
    var btn = document.getElementById("lkSearch");
    if (!refEl || !result) return;

    var ref = refEl.value.trim();
    var email = emailEl.value.trim();
    var phone = phoneEl.value.trim();

    if (!ref || (!email && !phone)) {
      result.hidden = true;
      states.hidden = false;
      states.innerHTML = '<div class="booking-msg booking-msg--error">' +
        t("lk_invalid", "Please enter your booking reference and either your email or phone.", "يرجى إدخال رقم الحجز وبريدك أو هاتفك.") + '</div>';
      return;
    }

    states.hidden = false;
    states.innerHTML = '<div class="booking-msg">' +
      t("lk_loading", "Looking up your booking…", "جارٍ البحث عن حجزك…") + '</div>';
    result.hidden = true;
    if (btn) btn.disabled = true;

    try {
      var b = null;

      // Live mode: call backend lookup endpoint (validates ref + contact atomically).
      var cfg = window.MGApiConfig;
      if (cfg && cfg.baseUrl) {
        try {
          var payload = { reference: ref };
          if (email) payload.email = email;
          if (phone) payload.phone = phone;
          var resp = await fetch(cfg.baseUrl + "/bookings/lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          var json = await resp.json().catch(function () { return null; });
          if (json && json.ok && json.booking) {
            b = normalizeBooking(json.booking);
          }
        } catch (e) {
          console.warn("[site-booking-lookup] REST lookup failed, trying demo:", e);
        }
      }

      // Demo fallback: search localStorage / seed data.
      if (!b) {
        var all = (await (window.MGSiteData
          ? window.MGSiteData.getList("bookings")
          : (window.__mgSeed ? window.__mgSeed().bookings : []))) || [];
        for (var i = 0; i < all.length; i++) {
          if (all[i].id === ref) { b = all[i]; break; }
        }
        // Demo mode: verify contact match client-side.
        if (b) {
          var emailMatch = email && String(b.email || "").toLowerCase().trim() === email.toLowerCase().trim();
          var phoneMatch = phone && String(b.phone || "").toLowerCase().trim() === phone.toLowerCase().trim();
          if (!emailMatch && !phoneMatch) b = null;
        }
      }

      if (!b) {
        states.hidden = false;
        states.innerHTML = '<div class="booking-msg booking-msg--error">' +
          t("lk_notfound", "We couldn't find a booking with those details. Please check your reference and contact information.", "تعذّر العثور على حجز بهذه البيانات. يرجى التحقق من الرقم ومعلومات الاتصال.") + '</div>';
        result.hidden = true;
        return;
      }

      states.hidden = true;
      var row = function (k, v) {
        return '<dt>' + t(k.k, k.en, k.ar) + '</dt><dd>' + esc(v == null ? "" : v) + '</dd>';
      };
      result.innerHTML =
        '<div class="booking-msg booking-msg--ok">' + t("lk_found", "Booking found", "تم العثور على الحجز") + '</div>' +
        '<dl class="dash-dl booking-dl">' +
          row({ k: "lk_ref", en: "Reference", ar: "المرجع" }, b.id) +
          row({ k: "lk_guest", en: "Guest", ar: "النزيل" }, b.guestName || b.guest) +
          row({ k: "lk_room", en: "Room", ar: "الغرفة" }, b.roomName || b.room) +
          row({ k: "lk_in", en: "Check-in", ar: "الوصول" }, b.checkin) +
          row({ k: "lk_out", en: "Check-out", ar: "المغادرة" }, b.checkout) +
          row({ k: "lk_nights", en: "Nights", ar: "الليالى" }, b.nights) +
          row({ k: "lk_adults", en: "Adults", ar: "بالغون" }, b.adults) +
          row({ k: "lk_children", en: "Children", ar: "أطفال" }, b.children) +
          row({ k: "lk_rooms", en: "Rooms", ar: "غرف" }, b.rooms) +
          row({ k: "lk_total", en: "Total", ar: "الإجمالي" }, money(b.total != null ? b.total : b.revenue)) +
          '<dt>' + t("lk_status", "Status", "الحالة") + '</dt><dd><span class="tag ' + statusClass(b.status || "Pending") + '">' + esc(b.status || "Pending") + '</span></dd>' +
          '<dt>' + t("lk_payment", "Payment", "الدفع") + '</dt><dd><span class="tag ' + payClass(b.paymentStatus) + '">' + esc(b.paymentStatus || "Unpaid") + '</span></dd>' +
          row({ k: "lk_created", en: "Created", ar: "أُنشئ" }, b.created) +
        '</dl>' +
        '<p class="text-muted booking-note">' +
          t("lk_readonly", "This is a read-only view. Contact the hotel to make changes.", "هذا عرض للقراءة فقط. تواصل مع الفندق لإجراء تغييرات.") + '</p>';
      result.hidden = false;
    } catch (e) {
      states.hidden = false;
      states.innerHTML = '<div class="booking-msg booking-msg--error">' +
        t("lk_error", "Something went wrong while looking up your booking. Please try again.", "حدث خطأ أثناء البحث عن حجزك. يرجى المحاولة لاحقًا.") + '</div>';
      result.hidden = true;
      console.error("[site-booking-lookup] failed:", e);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function init() {
    var btn = document.getElementById("lkSearch");
    if (!btn) return;
    btn.addEventListener("click", lookup);
    var enter = function (el) { el && el.addEventListener("keydown", function (e) { if (e.key === "Enter") lookup(); }); };
    enter(document.getElementById("lkRef"));
    enter(document.getElementById("lkEmail"));
    enter(document.getElementById("lkPhone"));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.MGBookingLookup = { lookup: lookup };
})();
