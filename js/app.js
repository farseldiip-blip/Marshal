/* =========================================================
   app.js — core interactions (loader, nav, theme, transitions)
   cursor + language live in their own modules.
   ========================================================= */
(function () {
  "use strict";

  /* ---------- Loader (self-contained; never depends on GSAP) ---------- */
  const loader = document.getElementById("loader");
  const loaderBar = document.getElementById("loaderBar");
  const loaderCount = document.getElementById("loaderCount");
  let prog = 0, loaderDone = false;
  if (loader) document.documentElement.classList.add("is-loading");

  function finishLoad() {
    if (loaderDone) return;
    loaderDone = true;
    const exit = () => {
      if (loader) loader.style.display = "none";
      document.documentElement.classList.remove("is-loading");
      if (window.__playHero) window.__playHero();
    };
    if (!loader) { exit(); return; }
    loader.classList.add("exit");
    let finished = false;
    loader.addEventListener("transitionend", function te(e) {
      if (e.propertyName === "transform" && !finished) { finished = true; loader.removeEventListener("transitionend", te); exit(); }
    });
    setTimeout(() => { if (!finished) { finished = true; exit(); } }, 1200); // safety fallback
  }

  if (loader) {
    const loadTimer = setInterval(() => {
      prog += Math.random() * 16 + 6;
      if (prog >= 100) {
        prog = 100; clearInterval(loadTimer);
        if (loaderBar) loaderBar.style.width = "100%";
        if (loaderCount) loaderCount.textContent = "100";
        setTimeout(finishLoad, 350);
        return;
      }
      if (loaderBar) loaderBar.style.width = prog + "%";
      if (loaderCount) loaderCount.textContent = Math.floor(prog);
    }, 130);
    // Safety: if the page is already fully loaded (cached), wrap up promptly.
    window.addEventListener("load", () => {
      if (prog < 100) { prog = 100; clearInterval(loadTimer); if (loaderBar) loaderBar.style.width = "100%"; if (loaderCount) loaderCount.textContent = "100"; setTimeout(finishLoad, 200); }
    });
    // Hard safety: never trap the visitor beyond 6s.
    setTimeout(() => { if (!loaderDone) { prog = 100; clearInterval(loadTimer); finishLoad(); } }, 6000);
  } else {
    if (window.__playHero) window.__playHero();
  }

  /* ---------- Navbar scroll state ---------- */
  const navbar = document.getElementById("navbar");
  const onScroll = () => {
    if (!navbar) return;
    navbar.classList.toggle("navbar--scrolled", window.scrollY > 40);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Scroll progress ---------- */
  const progress = document.getElementById("scrollProgress");
  const spScroll = () => {
    if (!progress) return;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + "%";
  };
  window.addEventListener("scroll", spScroll, { passive: true });
  spScroll();

  /* ---------- Back to top ---------- */
  const backTop = document.getElementById("backTop");
  if (backTop) {
    window.addEventListener("scroll", () => backTop.classList.toggle("show", window.scrollY > 600), { passive: true });
    backTop.addEventListener("click", () => {
      if (window.lenis) window.lenis.scrollTo(0, { duration: 1.2 });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ---------- Floating booking ---------- */
  const floatBook = document.getElementById("floatBook");
  if (floatBook) {
    window.addEventListener("scroll", () => floatBook.classList.toggle("show", window.scrollY > 900), { passive: true });
    floatBook.addEventListener("click", () => {
      const bookingSection = document.getElementById("booking");
      if (!bookingSection) return;
      if (window.lenis) window.lenis.scrollTo(bookingSection, { duration: 1.4 });
      else bookingSection.scrollIntoView({ behavior: "smooth" });
    });
  }

  /* ---------- Mobile menu ---------- */
  const burger = document.getElementById("navBurger");
  const mMenu = document.getElementById("mobileMenu");
  const mClose = document.getElementById("navClose");
  function setMenu(open) {
    if (!mMenu || !burger) return;
    mMenu.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.style.overflow = open ? "hidden" : "";
  }
  if (burger && mMenu) {
    burger.addEventListener("click", () => setMenu(!mMenu.classList.contains("open")));
    if (mClose) mClose.addEventListener("click", () => setMenu(false));
    mMenu.querySelectorAll("a").forEach(a => a.addEventListener("click", () => setMenu(false)));
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
  }

  /* ---------- Theme toggle ---------- */
  const themeToggle = document.getElementById("themeToggle");
  const root = document.documentElement;
  const savedTheme = localStorage.getItem("mg-theme") || "dark";
  root.setAttribute("data-theme", savedTheme);
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      localStorage.setItem("mg-theme", next);
    });
  }

  /* ---------- Page transition for internal links ---------- */
  document.querySelectorAll('a[href$=".html"]').forEach(a => {
    a.addEventListener("click", (e) => {
      const url = a.getAttribute("href");
      if (url.startsWith("http") || a.target === "_blank") return;
      e.preventDefault();
      const pt = document.getElementById("pageTransition");
      if (pt) { pt.style.transition = "transform 0.6s var(--ease)"; pt.style.transform = "translateY(0)"; }
      setTimeout(() => { window.location.href = url; }, 620);
    });
  });

  /* ---------- Footer year ---------- */
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  /* ---------- Contact form (no backend) ---------- */
  const cForm = document.getElementById("contactForm");
  if (cForm) {
    cForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const btn = cForm.querySelector("button[type='submit']");
      if (!btn) return;
      const ok = (window.MGLang && window.MGLang.get() === "ar") ? "تم الإرسال ✓" : "Sent ✓";
      const original = btn.textContent;
      btn.textContent = ok;
      btn.disabled = true;
      setTimeout(() => { btn.textContent = original; btn.disabled = false; cForm.reset(); }, 2200);
    });
  }
})();
