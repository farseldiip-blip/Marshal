/* =========================================================
   booking.js — booking widget, FAQ, testimonials, lightbox, lazy
   ========================================================= */
(function () {
  "use strict";

  /* ---------- Date defaults ---------- */
  const ci = document.getElementById("bkCheckin");
  const co = document.getElementById("bkCheckout");
  const bkRoom = document.getElementById("bkRoom");
  const fmt = (d) => d.toISOString().split("T")[0];
  if (ci && co) {
    const today = new Date();
    ci.value = fmt(today);
    co.value = fmt(new Date(today.getTime() + 86400000));
    ci.min = fmt(today);
    ci.addEventListener("change", () => {
      const d = new Date(ci.value);
      co.min = fmt(new Date(d.getTime() + 86400000));
      if (new Date(co.value) <= d) co.value = fmt(new Date(d.getTime() + 86400000));
    });
  }

  /* ---------- Room list cache (populated from live API) ---------- */
  var _roomList = [];

  /* ---------- Dynamically populate room select from live API ---------- */
  async function populateRoomSelect() {
    if (!bkRoom) return;
    let rooms = [];
    try {
      if (window.MGSiteData && window.MGSiteData.getList) {
        rooms = await window.MGSiteData.getList("rooms") || [];
      } else if (window.MGApiClient && window.MGApiConfig && window.MGApiConfig.baseUrl) {
        const res = await fetch(window.MGApiConfig.baseUrl + "/rooms", { headers: { Accept: "application/json" } });
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) rooms = json.data;
      }
    } catch (e) { /* fallback to existing options */ }
    if (!rooms.length) return;
    _roomList = rooms;
    const lang = (window.MGLang && window.MGLang.get && window.MGLang.get()) || "en";
    bkRoom.innerHTML = rooms.map(r => {
      const label = lang === "ar" && r.name_ar ? r.name_ar : (r.name || r.type || "");
      return "<option value=\"" + esc(r.id) + "\">" + esc(label) + " — " + esc(r.type || "") + "</option>";
    }).join("");
    document.dispatchEvent(new CustomEvent("avail:refresh"));
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { setTimeout(populateRoomSelect, 300); });
  } else {
    setTimeout(populateRoomSelect, 300);
  }

  /* ---------- Booking flow (Phase 1: availability + Pending booking) ---------- */
  const search = document.getElementById("bkSearch");
  const result = document.getElementById("bkResult");

  // shared.js is always loaded before this file (verified in all HTML pages).
  var t = MGShared.t;
  var esc = MGShared.esc;

  /* ---------- Basic input validation (no OTP / no verification) ---------- */
  // Full name: >=3 chars, letters and spaces only, must look like a name
  // (not a single repeated char, not a dictionary-ish "test"/"user").
  function validateName(v) {
    v = (v || "").trim();
    if (!v) return t("v_name_req", "Please enter your full name.", "يرجى إدخال الاسم الكامل.");
    if (v.length < 3) return t("v_name_min", "Name must be at least 3 characters.", "يجب أن يكون الاسم 3 أحرف على الأقل.");
    if (!/^[A-Za-z\u0600-\u06FF\s]+$/.test(v))
      return t("v_name_chars", "Name may contain letters and spaces only.", "يُسمح بالأحرف والمسافات فقط في الاسم.");
    // Reject sequences of one repeated character (e.g. "aaaa", "dddd").
    if (/(.)\1{2,}/.test(v.replace(/\s/g, "")))
      return t("v_name_rep", "Please enter a valid name.", "يرجى إدخال اسم صحيح.");
    // Reject obvious non-names.
    const low = v.toLowerCase().replace(/\s+/g, "");
    const banned = ["test", "user", "guest", "abc", "xyz", "name", "asdf", "qwerty"];
    if (banned.some(b => low.indexOf(b) !== -1))
      return t("v_name_real", "Please enter your real name.", "يرجى إدخال اسمك الحقيقي.");
    const words = v.trim().split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.every(w => w.length < 2))
      return t("v_name_real", "Please enter your real name.", "يرجى إدخال اسمك الحقيقي.");
    return null;
  }

  // Email: required, valid-ish format (local@domain.tld).
  function validateEmail(v) {
    v = (v || "").trim();
    if (!v) return t("v_email_req", "Please enter your email.", "يرجى إدخال البريد الإلكتروني.");
    // Must contain exactly one "@" with a dot in the domain part.
    const m = v.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    if (!m) return t("v_email_fmt", "Please enter a valid email (e.g. name@example.com).", "يرجى إدخال بريد صحيح (مثال: name@example.com).");
    return null;
  }

  // Phone: required, digits/spaces/+"-" only, realistic length.
  // Supports Egyptian: 01[0-2,5] + 8 digits, or +20 1[0-2,5] 8 digits.
  function validatePhone(v) {
    v = (v || "").trim();
    if (!v) return t("v_phone_req", "Please enter your phone number.", "يرجى إدخال رقم الهاتف.");
    if (/[A-Za-z]/.test(v)) return t("v_phone_chars", "Phone may contain digits only (no letters).", "يُسمح بالأرقام فقط في الهاتف (لا أحرف).");
    const digits = v.replace(/[\s+()-]/g, "");
    if (!/^\d{8,15}$/.test(digits))
      return t("v_phone_len", "Please enter a valid phone number.", "يرجى إدخال رقم هاتف صحيح.");
    // If it looks Egyptian, enforce the local pattern.
    if (/^(?:\+?20)?01[0125]\d{8}$/.test(digits)) return null;
    // Otherwise accept any 8–15 digit international number.
    if (/^\d{8,15}$/.test(digits)) return null;
    return t("v_phone_fmt", "Please enter a valid phone number.", "يرجى إدخال رقم هاتف صحيح.");
  }

  // Show an inline error under a field; clear if valid.
  function setFieldError(inputEl, msg) {
    if (!inputEl) return;
    let err = inputEl.parentNode.querySelector(".bk-field-err");
    if (msg) {
      if (!err) {
        err = document.createElement("div");
        err.className = "bk-field-err";
        inputEl.parentNode.appendChild(err);
      }
      err.textContent = msg;
      inputEl.classList.add("input--error");
    } else if (err) {
      err.textContent = "";
      inputEl.classList.remove("input--error");
    }
  }

  if (search && result && window.MGBooking) {
    search.addEventListener("click", async () => {
      if (!ci.value || !co.value) { alert(t("bk_err_dates", "Please choose check-in and check-out dates.", "يرجى اختيار تاريخ الدخول والخروج.")); return; }
      const n = Math.round((new Date(co.value) - new Date(ci.value)) / 86400000);
      if (n <= 0) { alert(t("bk_err_range", "Check-out must be after check-in.", "يجب أن يكون الخروج بعد الدخول.")); return; }

      const roomId = document.getElementById("bkRoom").value;
      // Look up the selected room from the cached live list (not from seed data).
      // This guarantees the room name in the error message matches the user's selection.
      const room = _roomList.find(function (r) { return r.id === roomId; }) || window.MGBooking.resolveRoom(roomId);
      const guestsVal = document.getElementById("bkGuests").value;
      const adults = parseInt(guestsVal, 10) || 1;

      search.textContent = t("bk_searching", "Checking availability…", "جارٍ التحقق من التوفر…");
      search.disabled = true;
      try {
        const avail = await window.MGBooking.getAvailability(room.id, ci.value, co.value);
        if (!avail.available) {
          result.hidden = false;
          result.innerHTML = `<div class="booking-msg booking-msg--error">${t("bk_unavail", "Sorry, " + esc(room.name) + " is not available for those dates.", "عذرًا، " + esc(room.name) + " غير متاح في تلك التواريخ.")}</div>`;
          return;
        }
        const price = window.MGBooking.priceFor(room, n, 1);
        result.hidden = false;
        result.innerHTML = `
          <div class="booking-msg booking-msg--ok">
            ${t("bk_avail", esc(room.name) + " is available.", esc(room.name) + " متاح.")}
          </div>
          <div class="booking-summary">
            <div class="booking-summary__row"><span>${t("bk_dates", "Dates", "التواريخ")}</span><strong>${esc(ci.value)} → ${esc(co.value)} · ${n} ${t("bk_nights", "night(s)", "ليلة")}</strong></div>
            <div class="booking-summary__row"><span>${t("bk_guests_l", "Guests", "الضيوف")}</span><strong>${adults} ${t("bk_adults", "adult(s)", "بالغ")}</strong></div>
            <div class="booking-summary__row"><span>${t("bk_total", "Estimated total", "الإجمالي التقديري")}</span><strong>${(window.MGSettings && MGSettings.formatMoney) ? MGSettings.formatMoney(price) : new Intl.NumberFormat("en-US", { style: "currency", currency: (window.MGSettings && MGSettings.getCurrency) ? MGSettings.getCurrency() : "USD", currencyDisplay: "symbol", minimumFractionDigits: 2 }).format(price)}</strong></div>
          </div>
          <div class="booking-form">
            <div class="field"><label>${t("bk_name", "Full name", "الاسم الكامل")}</label><input class="input" id="bkName" /></div>
            <div class="field"><label>Email</label><input class="input" id="bkEmail" type="email" /></div>
            <div class="field"><label>${t("bk_phone", "Phone", "الهاتف")}</label><input class="input" id="bkPhone" /></div>
            <button class="btn btn--primary" id="bkConfirm">${t("bk_confirm", "Confirm Booking", "تأكيد الحجز")}</button>
            <div class="booking-msg" id="bkConfirmMsg" hidden></div>
          </div>`;

        const confirmBtn = document.getElementById("bkConfirm");
        confirmBtn.addEventListener("click", async () => {
          const nameEl = document.getElementById("bkName");
          const emailEl = document.getElementById("bkEmail");
          const phoneEl = document.getElementById("bkPhone");
          const name = nameEl.value.trim();
          const email = emailEl.value.trim();
          const phone = phoneEl.value.trim();
          const msgEl = document.getElementById("bkConfirmMsg");

          // Basic realistic validation — block submission until valid.
          const nameErr = validateName(name);
          const emailErr = validateEmail(email);
          const phoneErr = validatePhone(phone);
          setFieldError(nameEl, nameErr);
          setFieldError(emailEl, emailErr);
          setFieldError(phoneEl, phoneErr);
          if (nameErr || emailErr || phoneErr) {
            msgEl.hidden = false; msgEl.className = "booking-msg booking-msg--error";
            msgEl.textContent = t("bk_err_fix", "Please correct the highlighted fields.", "يرجى تصحيح الحقول المميزة.");
            return;
          }

          // Pre-submit backend re-check — guards against late over-booking.
          try {
            const re = await window.MGBooking.getAvailability(room.id, ci.value, co.value);
            const reUnits = (typeof re.availableUnits === "number") ? re.availableUnits : (re.available ? 1 : 0);
            if (!re.available || reUnits < 1) {
              msgEl.hidden = false; msgEl.className = "booking-msg booking-msg--error";
              msgEl.textContent = t("av_overbooked", "The requested number of rooms is not available for the selected period.", "عدد الغرف المطلوب غير متاح للفترة المحددة.");
              confirmBtn.disabled = false;
              confirmBtn.textContent = t("bk_confirm", "Confirm Booking", "تأكيد الحجز");
              return;
            }
          } catch (e) { /* backend create will surface the truth */ }

          confirmBtn.disabled = true;
          confirmBtn.textContent = t("bk_submitting", "Submitting…", "جارٍ الإرسال…");
          try {
            const created = await window.MGBooking.createBooking({
              guestName: name, email, phone,
              roomId: room.id, checkin: ci.value, checkout: co.value,
              adults, children: 0, rooms: 1
            });
            // Hold the booking (incl. server-issued accessToken) in memory
            // for the current payment session. NOT persisted to localStorage;
            // NOT placed in the URL. Cleared on navigation away.
            window.__mgCurrentBooking = created;
            msgEl.hidden = false; msgEl.className = "booking-msg booking-msg--ok";
            msgEl.innerHTML = `${t("bk_done", "Booking confirmed! Reference: ", "تم تأكيد الحجز! المرجع: ")}<strong>${esc(created.id)}</strong><br> ${t("bk_status", "Status: Pending · Payment: Unpaid", "الحالة: قيد الانتظار · الدفع: غير مدفوع")}`;
            confirmBtn.textContent = t("bk_confirmed", "Booked", "تم الحجز");
            if (window.MGPayment && window.MGPayment.openModal) {
              // Open the Demo Payment Gateway automatically for the new booking.
              window.MGPayment.openModal(created);
            } else if (window.MGPayment && window.MGPayment.bindConfirmPanel) {
              window.MGPayment.bindConfirmPanel();
            }
            document.dispatchEvent(new CustomEvent("avail:refresh"));
          } catch (e) {
            msgEl.hidden = false; msgEl.className = "booking-msg booking-msg--error";
            msgEl.textContent = t("bk_fail", "Could not complete booking: " + e.message, "تعذّر إتمام الحجز: " + e.message);
            confirmBtn.disabled = false;
            confirmBtn.textContent = t("bk_confirm", "Confirm Booking", "تأكيد الحجز");
          }
        });
      } finally {
        search.textContent = t("bk_search", "Search", "بحث");
        search.disabled = false;
      }
    });
  }

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll("#faqAcc .acc-item").forEach((item) => {
    const head = item.querySelector(".acc-head");
    const body = item.querySelector(".acc-body");
    head.addEventListener("click", () => {
      const isOpen = item.classList.contains("open");
      document.querySelectorAll("#faqAcc .acc-item.open").forEach((o) => {
        o.classList.remove("open");
        o.querySelector(".acc-body").style.height = "0px";
      });
      if (!isOpen) {
        item.classList.add("open");
        body.style.height = body.firstElementChild.offsetHeight + "px";
      }
    });
  });

  /* ---------- Testimonials swiper ----------
     Swiper is loaded via an async CDN <script>, so window.Swiper may not
     exist yet when this script runs. Retry briefly until it's available.
     Exposed as window.initTestiSwiper so the data layer can (re)init after
     dynamically injecting review slides.
     BUG FIX: loop:true breaks with 1 slide. Handle 0/1/N slides. */
  let _testiSwiper = null;
  function initTestimonials() {
    const el = document.getElementById("testiSwiper");
    const wrap = document.getElementById("testiWrap");
    if (!el || !window.Swiper || !wrap) return false;
    // Destroy any prior instance so re-rendered slides start clean.
    if (_testiSwiper) { _testiSwiper.destroy(true, true); _testiSwiper = null; }
    if (el.swiper) { el.swiper.destroy(true, true); }
    const slideCount = wrap.querySelectorAll(".swiper-slide").length;
    // Hide navigation + pagination for 0 or 1 slides
    const prevBtn = document.getElementById("testiPrev");
    const nextBtn = document.getElementById("testiNext");
    const dots = el.querySelector(".swiper-pagination");
    if (slideCount <= 1) {
      if (prevBtn) prevBtn.style.display = "none";
      if (nextBtn) nextBtn.style.display = "none";
      if (dots) dots.style.display = "none";
      return true;
    }
    if (prevBtn) prevBtn.style.display = "";
    if (nextBtn) nextBtn.style.display = "";
    if (dots) dots.style.display = "";
    _testiSwiper = new Swiper("#testiSwiper", {
      slidesPerView: 1, spaceBetween: 24, grabCursor: true,
      loop: slideCount > 1,
      autoHeight: true,
      pagination: { el: ".voices__dots", clickable: true },
      navigation: { prevEl: "#testiPrev", nextEl: "#testiNext" },
      breakpoints: { 900: { slidesPerView: 1 } }
    });
    return true;
  }
  window.initTestiSwiper = initTestimonials;

  if (!initTestimonials()) {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (initTestimonials() || tries > 40) clearInterval(t);
    }, 150);
  }

  /* ---------- Lightbox (event-delegated so injected items work) ---------- */
  const lb = document.getElementById("lightbox");
  if (lb) {
    const lbImg = lb.querySelector("img");
    const open = (src) => { lbImg.src = src; lb.classList.add("open"); document.body.style.overflow = "hidden"; };
    const close = () => { lb.classList.remove("open"); document.body.style.overflow = ""; };
    document.addEventListener("click", (e) => {
      const a = e.target.closest("[data-lightbox]");
      if (a) { e.preventDefault(); open(a.getAttribute("href")); }
    });
    const lbClose = lb.querySelector(".lightbox__close");
    if (lbClose) lbClose.addEventListener("click", close);
    lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && lb.classList.contains("open")) close(); });
  }

  /* ---------- Lazy-load fade-in (progressive enhancement) ---------- */
  if ("loading" in HTMLImageElement.prototype) {
    document.querySelectorAll("img[loading='lazy']").forEach((img) => {
      if (img.complete) return;
      img.style.opacity = "0";
      img.style.transition = "opacity 0.6s ease";
      img.addEventListener("load", () => { img.style.opacity = "1"; }, { once: true });
    });
  }
})();
