/* =========================================================
   site-booking-lookup.js — Public "My Booking" lookup.
   ---------------------------------------------------------
   Secure, read-only guest lookup using the shared data layer
   (MGSiteData -> Firestore `bookings` live, mg-demo-db demo).

   Rules:
   - Reference is required AND at least one contact (email|phone)
     must match the booking. Reference alone reveals nothing.
   - On any mismatch -> generic "not found", no indication
     whether the reference exists.
   - Read-only: no edit / cancel / delete.
   ========================================================= */
(function () {
  "use strict";

  function t(key, en, ar) {
    const lang = window.MGLang && window.MGLang.get && window.MGLang.get();
    return lang === "ar" ? (ar || en) : en;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function money(n) { return "$" + Number(n || 0).toLocaleString(); }

  function statusClass(s) {
    return { "Checked In": "tag-CheckedIn", "Checked Out": "tag-CheckedOut" }[s] || ("tag-" + s);
  }
  function payClass(p) {
    if (p === "Paid") return "tag-Paid";
    if (p === "Unpaid") return "tag-Unpaid";
    return "tag-" + (p || "Unpaid");
  }
  function normalize(v) { return String(v == null ? "" : v).trim().toLowerCase().replace(/\s+/g, ""); }

  async function lookup() {
    const refEl = document.getElementById("lkRef");
    const emailEl = document.getElementById("lkEmail");
    const phoneEl = document.getElementById("lkPhone");
    const states = document.getElementById("lkStates");
    const result = document.getElementById("lkResult");
    const btn = document.getElementById("lkSearch");
    if (!refEl || !result) return;

    const ref = refEl.value.trim();
    const email = emailEl.value.trim();
    const phone = phoneEl.value.trim();

    // Invalid input: missing reference or no contact provided.
    if (!ref || (!email && !phone)) {
      result.hidden = true;
      states.hidden = false;
      states.innerHTML = `<div class="booking-msg booking-msg--error">${t("lk_invalid", "Please enter your booking reference and either your email or phone.", "يرجى إدخال رقم الحجز وبريدك أو هاتفك.")}</div>`;
      return;
    }

    states.hidden = false;
    states.innerHTML = `<div class="booking-msg">${t("lk_loading", "Looking up your booking…", "جارٍ البحث عن حجزك…")}</div>`;
    result.hidden = true;
    if (btn) btn.disabled = true;

    try {
      const all = (await (window.MGSiteData
        ? window.MGSiteData.getList("bookings")
        : (window.__mgSeed ? window.__mgSeed().bookings : []))) || [];

      // Find by reference only first (do NOT reveal existence).
      const b = all.find(x => (x.id || "") === ref);

      // Verify contact match. If no match -> generic not-found.
      const ok = b && (
        (email && normalize(b.email) === normalize(email)) ||
        (phone && normalize(b.phone) === normalize(phone))
      );

      if (!ok) {
        states.hidden = false;
        states.innerHTML = `<div class="booking-msg booking-msg--error">${t("lk_notfound", "We couldn't find a booking with those details. Please check your reference and contact information.", "تعذّر العثور على حجز بهذه البيانات. يرجى التحقق من الرقم ومعلومات الاتصال.")}</div>`;
        result.hidden = true;
        return;
      }

      // Found + verified -> show read-only details.
      states.hidden = true;
      const row = (k, v) => `<dt>${t(k.k, k.en, k.ar)}</dt><dd>${esc(v == null ? "" : v)}</dd>`;
      result.innerHTML = `
        <div class="booking-msg booking-msg--ok">${t("lk_found", "Booking found", "تم العثور على الحجز")}</div>
        <dl class="dash-dl booking-dl">
          ${row({ k: "lk_ref", en: "Reference", ar: "المرجع" }, b.id)}
          ${row({ k: "lk_guest", en: "Guest", ar: "النزيل" }, b.guestName || b.guest)}
          ${row({ k: "lk_room", en: "Room", ar: "الغرفة" }, b.roomName || b.room)}
          ${row({ k: "lk_in", en: "Check-in", ar: "الوصول" }, b.checkin)}
          ${row({ k: "lk_out", en: "Check-out", ar: "المغادرة" }, b.checkout)}
          ${row({ k: "lk_nights", en: "Nights", ar: "الليالى" }, b.nights)}
          ${row({ k: "lk_adults", en: "Adults", ar: "بالغون" }, b.adults)}
          ${row({ k: "lk_children", en: "Children", ar: "أطفال" }, b.children)}
          ${row({ k: "lk_rooms", en: "Rooms", ar: "غرف" }, b.rooms)}
          ${row({ k: "lk_total", en: "Total", ar: "الإجمالي" }, money(b.total != null ? b.total : b.revenue))}
          <dt>${t("lk_status", "Status", "الحالة")}</dt><dd><span class="tag ${statusClass(b.status || "Pending")}">${esc(b.status || "Pending")}</span></dd>
          <dt>${t("lk_payment", "Payment", "الدفع")}</dt><dd><span class="tag ${payClass(b.paymentStatus)}">${esc(b.paymentStatus || "Unpaid")}</span></dd>
          ${row({ k: "lk_created", en: "Created", ar: "أُنشئ" }, b.created)}
        </dl>
        <p class="text-muted booking-note">${t("lk_readonly", "This is a read-only view. Contact the hotel to make changes.", "هذا عرض للقراءة فقط. تواصل مع الفندق لإجراء تغييرات.")}</p>`;
      result.hidden = false;
    } catch (e) {
      states.hidden = false;
      states.innerHTML = `<div class="booking-msg booking-msg--error">${t("lk_error", "Something went wrong while looking up your booking. Please try again.", "حدث خطأ أثناء البحث عن حجزك. يرجى المحاولة لاحقًا.")}</div>`;
      result.hidden = true;
      console.error("[site-booking-lookup] failed:", e);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function init() {
    const btn = document.getElementById("lkSearch");
    if (!btn) return;
    btn.addEventListener("click", lookup);
    const enter = (el) => el && el.addEventListener("keydown", e => { if (e.key === "Enter") lookup(); });
    enter(document.getElementById("lkRef"));
    enter(document.getElementById("lkEmail"));
    enter(document.getElementById("lkPhone"));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.MGBookingLookup = { lookup };
})();
