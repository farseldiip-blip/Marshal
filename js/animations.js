/* =========================================================
   animations.js — cinematic motion engine
   GSAP + ScrollTrigger + Lenis (primary). SplitType done in-house.
   Every animation has intent; reduced-motion short-circuits all of it.
   ========================================================= */
(function () {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;
  const hasGSAP = !!window.gsap;

  /* ---------- Dependency-free SplitType (lines + words) ---------- */
  function splitLines(el) {
    if (!el) return [];
    // If the markup already declares .line wrappers (e.g. hero), use them.
    if (el.querySelector(".line > span")) return Array.from(el.querySelectorAll(".line > span"));
    if (el.dataset.split === "done") return Array.from(el.querySelectorAll(".line > span"));
    const text = el.textContent;
    el.textContent = "";
    const words = text.split(/(\s+)/);
    const line = document.createElement("span");
    line.className = "line";
    const inner = document.createElement("span");
    line.appendChild(inner);
    el.appendChild(line);
    let cur = inner;
    words.forEach((w) => {
      if (/^\s+$/.test(w)) {
        const nxt = document.createElement("span");
        nxt.className = "line";
        const ni = document.createElement("span");
        nxt.appendChild(ni);
        el.appendChild(nxt);
        cur = ni;
      } else {
        cur.appendChild(document.createTextNode(w + " "));
      }
    });
    el.dataset.split = "done";
    return Array.from(el.querySelectorAll(".line > span"));
  }

  /* ---------- Reduced motion: show everything, no JS animation ---------- */
  if (reduce || !hasGSAP) {
    root.classList.remove("has-anim");
    window.__playHero = function () {};
    return; // app.js still handles loader fade (CSS) so content is visible
  }

  root.classList.add("has-anim");
  gsap.registerPlugin(ScrollTrigger);

  /* ---------- Lenis smooth scroll (drives ScrollTrigger) ---------- */
  let lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6
    });
    window.lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }

  const EASE = "power3.out";
  const EASE_SOFT = "power2.out";

  /* =========================================================
     LOADER handled by app.js (framework-independent).
     __playHero is called by app.js when the loader exits.
     ========================================================= */

  /* =========================================================
     HERO
     ========================================================= */
  window.__playHero = function () {
    const title = document.getElementById("heroTitle");
    if (!title) return;
    const lines = splitLines(title);
    gsap.set(title, { autoAlpha: 1 });
    const tl = gsap.timeline({ defaults: { ease: EASE } });
    tl.from(".hero__bg", { scale: 1.25, duration: 1.8, ease: "power2.out" }, 0)
      .from(".hero .eyebrow", { y: 22, autoAlpha: 0, duration: 0.7 }, 0.2)
      .from(lines, { yPercent: 115, duration: 1.15, stagger: 0.12, ease: "power4.out" }, 0.3)
      .from(".hero__sub", { y: 26, autoAlpha: 0, duration: 0.9 }, "-=0.7")
      .from(".hero__cta > *", { y: 26, autoAlpha: 0, duration: 0.8, stagger: 0.12 }, "-=0.55")
      .from(".scroll-indicator", { autoAlpha: 0, y: 16, duration: 0.7 }, "-=0.4")
      .from(".float-deco", { autoAlpha: 0, scale: 0.6, duration: 1.0, stagger: 0.15 }, "-=0.8");
    gsap.delayedCall(0.25, navIntro);
  };

  function heroParallax() {
    const bg = document.getElementById("heroBg");
    const content = document.querySelector(".hero__content");
    if (bg) {
      gsap.to(bg, {
        yPercent: 16, ease: "none",
        scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: true }
      });
    }
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      const hero = document.getElementById("hero");
      if (!hero) return;
      hero.addEventListener("mousemove", (e) => {
        const r = hero.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) / r.width;
        const y = (e.clientY - r.top - r.height / 2) / r.height;
        gsap.to(bg, { x: x * 24, y: y * 18, duration: 1.1, ease: "power3.out" });
        if (content) gsap.to(content, { x: x * -14, y: y * -10, duration: 1.1, ease: "power3.out" });
      });
      hero.addEventListener("mouseleave", () => {
        gsap.to([bg, content], { x: 0, y: 0, duration: 1.2, ease: "power3.out" });
      });
    }
  }

  /* =========================================================
     NAVBAR — links reveal + active indicator
     ========================================================= */
  function navIntro() {
    const links = gsap.utils.toArray(".nav-links a");
    if (links.length) {
      gsap.from(links, {
        y: -16, autoAlpha: 0, duration: 0.8, stagger: 0.07, ease: EASE,
        delay: 0.2, onComplete: () => gsap.set(links, { clearProps: "transform" })
      });
    }
  }

  function navActive() {
    const map = { experience: "#experience", rooms: "#rooms", amenities: "#amenities", gallery: "#gallery", dining: "#dining", contact: "#contact" };
    const navAnchors = gsap.utils.toArray(".nav-links a");
    Object.keys(map).forEach((key) => {
      const sec = document.querySelector(map[key]);
      if (!sec) return;
      ScrollTrigger.create({
        trigger: sec, start: "top 45%", end: "bottom 45%",
        onToggle: (self) => {
          if (self.isActive) {
            navAnchors.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === map[key]));
          }
        }
      });
    });
  }

  /* =========================================================
     SCROLL REVEALS — data-driven, trigger once
     ========================================================= */
  function sectionReveals() {
    gsap.utils.toArray(".reveal, .reveal-left, .reveal-right, .reveal-scale").forEach((el) => {
      const delay = parseFloat(el.dataset.revealDelay || 0);
      gsap.to(el, {
        opacity: 1, x: 0, y: 0, scale: 1, duration: 1.0, ease: EASE, delay,
        scrollTrigger: { trigger: el, start: "top 88%", once: true }
      });
    });

    gsap.utils.toArray(".mask-reveal").forEach((el) => {
      gsap.to(el, {
        clipPath: "inset(0 0 0% 0)", duration: 1.1, ease: EASE,
        scrollTrigger: { trigger: el, start: "top 90%", once: true }
      });
    });

    gsap.utils.toArray(".img-reveal").forEach((el) => {
      gsap.to(el, {
        clipPath: "inset(0 0 0% 0)", duration: 1.2, ease: EASE,
        scrollTrigger: { trigger: el, start: "top 90%", once: true }
      });
    });

    gsap.utils.toArray("[data-stagger]").forEach((group) => {
      const kids = group.querySelectorAll(".reveal, .reveal-left, .reveal-right, .reveal-scale, [data-stagger-item]");
      gsap.to(kids, {
        opacity: 1, x: 0, y: 0, scale: 1, duration: 0.9, ease: EASE,
        stagger: 0.1, scrollTrigger: { trigger: group, start: "top 85%", once: true }
      });
    });
  }

  /* =========================================================
     PARALLAX (backgrounds / media) — scrubbed, gentle
     ========================================================= */
  function parallax() {
    gsap.utils.toArray("[data-parallax]").forEach((el) => {
      const speed = parseFloat(el.dataset.parallax || 0.15);
      gsap.to(el, {
        yPercent: speed * 100, ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true }
      });
    });
    gsap.utils.toArray(".g-item").forEach((el, i) => {
      const off = (i % 3 - 1) * 8;
      gsap.fromTo(el, { y: -off }, {
        y: off, ease: "none",
        scrollTrigger: { trigger: "#gallery", start: "top bottom", end: "bottom top", scrub: true }
      });
    });
  }

  /* =========================================================
     ROOM CARDS — entrance stagger
     ========================================================= */
  function roomCards() {
    const grid = document.getElementById("roomGrid");
    if (!grid) return;
    const cards = grid.querySelectorAll(".room-card");
    gsap.from(cards, {
      y: 60, autoAlpha: 0, duration: 1.0, ease: EASE, stagger: 0.14,
      scrollTrigger: { trigger: grid, start: "top 82%", once: true }
    });
  }

  /* =========================================================
     GUEST VOICES — handled by the Swiper carousel (booking.js).
     We deliberately do NOT run a gsap.from() on .voice-card here:
     Swiper clones slides for loop:true, and animating the originals
     would leave the clones invisible / break the carousel on scroll.
     The section header already reveals via .reveal.
     ========================================================= */
  function guestVoices() { /* no-op: Swiper owns these cards */ }

  /* =========================================================
     FOOTER reveal
     ========================================================= */
  function footerReveal() {
    const cols = gsap.utils.toArray(".footer > .container > div");
    if (!cols.length) return;
    gsap.from(cols, {
      y: 40, autoAlpha: 0, duration: 0.9, ease: EASE, stagger: 0.1,
      scrollTrigger: { trigger: ".footer", start: "top 90%", once: true }
    });
  }

  /* =========================================================
     MAGNETIC buttons (desktop pointer only)
     ========================================================= */
  function magnetic() {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    gsap.utils.toArray(".magnetic, .btn--gold, .back-to-top, .float-book").forEach((btn) => {
      const strength = (btn.classList.contains("back-to-top") || btn.classList.contains("float-book")) ? 0.25 : 0.35;
      btn.addEventListener("mousemove", (e) => {
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * strength;
        const y = (e.clientY - r.top - r.height / 2) * strength;
        gsap.to(btn, { x, y, duration: 0.5, ease: "power3.out" });
      });
      btn.addEventListener("mouseleave", () => gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1,0.4)" }));
    });
  }

  /* =========================================================
     BOOKING widget entrance + success pulse
     ========================================================= */
  function booking() {
    const b = document.getElementById("booking");
    const inner = b && b.querySelector(".booking");
    if (inner) {
      gsap.from(inner, {
        y: 50, autoAlpha: 0, duration: 1.1, ease: EASE,
        scrollTrigger: { trigger: b, start: "top 90%", once: true }
      });
    }
    const search = document.getElementById("bkSearch");
    if (search) {
      search.addEventListener("click", () => {
        gsap.fromTo(search, { scale: 1 }, { scale: 0.94, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.inOut" });
      });
    }
  }

  /* =========================================================
     SCROLL PROGRESS
     ========================================================= */
  function progressBar() {
    const bar = document.getElementById("scrollProgress");
    if (!bar) return;
    const update = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const p = h > 0 ? (window.scrollY / h) * 100 : 0;
      bar.style.width = p + "%";
    };
    if (lenis) lenis.on("scroll", update);
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  /* =========================================================
     INIT
     ========================================================= */
  function init() {
    sectionReveals();
    parallax();
    roomCards();
    guestVoices();
    footerReveal();
    booking();
    navActive();
    magnetic();
    progressBar();
    heroParallax();
    ScrollTrigger.refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
