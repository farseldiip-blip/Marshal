/* =========================================================
   booking.js — booking widget, FAQ, testimonials, lightbox, lazy
   ========================================================= */
(function () {
  "use strict";

  /* ---------- Date defaults ---------- */
  const ci = document.getElementById("bkCheckin");
  const co = document.getElementById("bkCheckout");
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

  const search = document.getElementById("bkSearch");
  if (search) {
    search.addEventListener("click", () => {
      const nights = Math.max(1, Math.round((new Date(co.value) - new Date(ci.value)) / 86400000));
      const room = document.getElementById("bkRoom").value;
      const guests = document.getElementById("bkGuests").value;
      const orig = search.textContent;
      search.textContent = (window.MGLang && window.MGLang.get() === "ar") ? "جارٍ البحث…" : "Searching…";
      search.disabled = true;
      setTimeout(() => {
        const msg = (window.MGLang && window.MGLang.get() === "ar")
          ? `تم العثور على خيارات: ${room} · ${guests} · ${nights} ليلة`
          : `Found options: ${room} · ${guests} · ${nights} night(s)`;
        search.textContent = (window.MGLang && window.MGLang.get() === "ar") ? "احجز الآن" : "Book Now";
        search.disabled = false;
        alert(msg);
        window.location.href = "pages/rooms.html";
      }, 900);
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

  /* ---------- Testimonials swiper ---------- */
  if (window.Swiper && document.getElementById("testiSwiper")) {
    new Swiper("#testiSwiper", {
      slidesPerView: 1, spaceBetween: 24, grabCursor: true, loop: true,
      autoHeight: true,
      pagination: { el: ".testi__dots", clickable: true },
      navigation: { prevEl: "#testiPrev", nextEl: "#testiNext" },
      breakpoints: { 900: { slidesPerView: 1 } }
    });
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
