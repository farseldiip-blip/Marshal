/* =========================================================
   animations.js — cinematic motion engine
   GSAP + ScrollTrigger + Lenis (primary). SplitType done in-house.
   Every animation has intent; reduced-motion short-circuits all of it.
   ========================================================= */
(function () {
  "use strict";

  const systemPrefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Local development (localhost / 127.0.0.1) forces the animation engine
     on for visual testing. Production domains still respect the user's
     prefers-reduced-motion preference. */
  const isLocalDevelopment = location.hostname === "127.0.0.1" || location.hostname === "localhost";
  const reduce = systemPrefersReducedMotion && !isLocalDevelopment;

  const root = document.documentElement;
  const MQ_MOBILE = window.matchMedia("(max-width: 767px)");
  const isMobile = () => MQ_MOBILE.matches;

  /* ---------- is-loading watchdog ----------
     html.is-loading is normally cleared by js/app.js (loader exit). If that
     path never runs (blocked/broken script), never trap the visitor in a
     hidden hero or locked scroll: clear it and reveal the page. Applies to
     every path, including reduced-motion. */
  (function armWatchdog() {
    let cleared = false;
    const clear = () => {
      if (cleared) return;
      cleared = true;
      if (root.classList.contains("is-loading")) {
        root.classList.remove("is-loading");
        const loaderEl = document.getElementById("loader");
        if (loaderEl) loaderEl.classList.add("done");
        if (window.__playHero) window.__playHero();
      }
    };
    if (document.readyState === "complete") setTimeout(clear, 7000);
    else window.addEventListener("load", () => setTimeout(clear, 7000));
    setTimeout(clear, 12000);
  })();

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
  if (reduce) {
    root.classList.remove("has-anim");
    window.__playHero = function () {};
    return; // app.js still handles loader fade (CSS) so content is visible
  }

  /* ---------- GSAP + ScrollTrigger arrive via async CDN scripts, so this
     script may execute before they finish downloading. initAnimationEngine()
     is IDEMPOTENT and is re-invoked from every readiness path below; the
     dependency polling keeps retrying until success or a displayed timeout
     (never a silent give-up). If the engine still cannot start, failSafe()
     makes every element visible so the page is never left broken. ---------- */
  let engineInitialized = false;
  let failSafeApplied = false;
  /* True when the engine became ready while the loader was still up. In that
     case the hero is still in its pre-load start state (CSS / GSAP set) and
     the entrance timeline can play. If the engine only becomes ready AFTER the
     loader already revealed the hero, __playHero must NOT snap it back to the
     start state (that is exactly the FOUC we are fixing) — leave it static. */
  let engineReadyDuringLoad = false;

  function initAnimationEngine() {
    if (engineInitialized) return true;
    if (!window.gsap || !window.ScrollTrigger) return false;

    try {
      gsap.registerPlugin(ScrollTrigger);
      engineReadyDuringLoad = root.classList.contains("is-loading");
      root.classList.add("has-anim");
      console.log("[MG Animations] animation system initialized");

  /* ---------- Lenis smooth scroll (drives ScrollTrigger) ----------
     Optional third-party dependency: if it fails to initialize it must
     NOT take down the whole animation engine. */
  let lenis = null;
  if (window.Lenis) {
    try {
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
    } catch (lenisErr) {
      /* non-fatal: engine continues without Lenis smooth scroll */
    }
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
    if (window.__heroPlayed) return;
    window.__heroPlayed = true;
    const title = document.getElementById("heroTitle");
    if (!title) return;
    const lines = splitLines(title);

    /* Deferred-engine guard: if GSAP only became ready after the loader had
       already revealed the hero (is-loading already cleared), snapping the
       elements back to their start states would re-trigger the exact
       "show → reset → animate" flash this module exists to prevent. Leave the
       hero static — it is already fully visible. */
    if (!engineReadyDuringLoad && !root.classList.contains("is-loading")) return;

    gsap.set(title, { autoAlpha: 1 });

    /* Apply the full start state synchronously — identical to the
       html.is-loading CSS values — so the CSS→GSAP hand-off on loader exit
       (is-loading removed + __playHero on the same tick) has zero visible
       jump for ANY element, even ones whose tween starts later in the
       timeline. */
    gsap.set(".hero__bg", { scale: 1.05 });
    gsap.set(".navbar", { y: -24, autoAlpha: 0 });
    gsap.set(".hero .eyebrow", { y: isMobile() ? 16 : 24, autoAlpha: 0 });
    gsap.set(lines, { yPercent: 115 });
    gsap.set(".hero__sub", { y: isMobile() ? 18 : 28, autoAlpha: 0 });
    gsap.set(".hero__cta > *", { y: isMobile() ? 18 : 28, autoAlpha: 0 });
    gsap.set(".scroll-indicator", { y: isMobile() ? 12 : 18, autoAlpha: 0 });
    gsap.set(".float-deco", { scale: 0.9, autoAlpha: 0 });

    const tl = gsap.timeline({ defaults: { ease: EASE } });
    tl.fromTo(".hero__bg", { scale: 1.05 }, { scale: 1.12, duration: 2.2, ease: "power2.out" }, 0)
      .fromTo(".navbar", { y: -24, autoAlpha: 0 }, {
        y: 0, autoAlpha: 1, duration: 0.9,
        onComplete: () => gsap.set(".navbar", { clearProps: "transform" })
      }, 0.15)
      .fromTo(".hero .eyebrow", { y: isMobile() ? 16 : 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7 }, 0.25)
      .fromTo(lines, { yPercent: 115 }, { yPercent: 0, duration: 1.15, stagger: isMobile() ? 0.1 : 0.12, ease: "power4.out" }, 0.35)
      .fromTo(".hero__sub", { y: isMobile() ? 18 : 28, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.9 }, "-=0.7")
      .fromTo(".hero__cta > *", { y: isMobile() ? 18 : 28, autoAlpha: 0 }, {
        y: 0, autoAlpha: 1, duration: 0.8, stagger: isMobile() ? 0.08 : 0.12,
        onComplete: () => gsap.set(".hero__cta > *", { clearProps: "transform" })
      }, "-=0.55")
      .fromTo(".scroll-indicator", { y: isMobile() ? 12 : 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7 }, "-=0.4")
      .fromTo(".float-deco", { scale: 0.9, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 1.0, stagger: 0.15 }, "-=0.8");
    gsap.delayedCall(0.25, navIntro);
  };

  function heroParallax() {
    const bg = document.getElementById("heroBg");
    const content = document.querySelector(".hero__content");
    if (bg && !isMobile()) {
      gsap.to(bg, {
        yPercent: 6, ease: "none",
        scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: true }
      });
    }
    if (!isMobile() && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
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
      gsap.fromTo(links, { y: -24, autoAlpha: 0 }, {
        y: 0, autoAlpha: 1, duration: 0.8, stagger: 0.07, ease: EASE,
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
     SCROLL REVEALS — data-driven, trigger once.
     bindReveals(scope) is idempotent: bound elements get a
     data-revealed marker, so it is safe to re-run after async
     content injection or language re-renders (room cards,
     gallery, menu) — injected .reveal elements get bound too.
     ========================================================= */
  function markRevealed(el) {
    el.setAttribute("data-revealed", "1");
  }
  function isRevealed(el) {
    return el.hasAttribute("data-revealed");
  }

  function bindReveal(el) {
    const delay = parseFloat(el.dataset.revealDelay || 0);
    gsap.to(el, {
      opacity: 1, x: 0, y: 0, scale: 1, duration: 1.0, ease: EASE, delay,
      scrollTrigger: { trigger: el, start: "top 88%", once: true }
    });
  }

  function bindClip(el, dur) {
    gsap.to(el, {
      clipPath: "inset(0 0 0% 0)", duration: dur, ease: EASE,
      scrollTrigger: { trigger: el, start: "top 90%", once: true }
    });
  }

  function bindImage(img) {
    const wrap = img.closest(".media-frame, .g-item");
    if (!wrap) return;
    gsap.fromTo(img, { scale: isMobile() ? 1.04 : 1.07 }, {
      scale: 1, duration: isMobile() ? 1.0 : 1.4, ease: EASE_SOFT,
      scrollTrigger: { trigger: wrap, start: "top 88%", once: true },
      onComplete: () => gsap.set(img, { clearProps: "transform" })
    });
  }

  const REVEAL_CLASSES = ".reveal:not([data-reveal]), .reveal-left:not([data-reveal]), .reveal-right:not([data-reveal]), .reveal-scale:not([data-reveal])";

  function bindReveals(scope) {
    const root = scope || document;
    root.querySelectorAll(REVEAL_CLASSES).forEach((el) => {
      if (isRevealed(el) || el.classList.contains("room-card") || el.closest("[data-stagger]")) return;
      markRevealed(el);
      bindReveal(el);
    });
    root.querySelectorAll("[data-reveal]").forEach((el) => {
      if (isRevealed(el)) return;
      markRevealed(el);
      bindReveal(el);
    });
    root.querySelectorAll(".mask-reveal, .img-reveal").forEach((el) => {
      if (isRevealed(el)) return;
      markRevealed(el);
      bindClip(el, el.classList.contains("img-reveal") ? 1.2 : 1.1);
    });
    root.querySelectorAll("[data-stagger]").forEach((group) => {
      if (isRevealed(group)) return;
      markRevealed(group);
      const kids = group.querySelectorAll(REVEAL_CLASSES + ", [data-stagger-item]");
      kids.forEach((k) => markRevealed(k));
      gsap.to(kids, {
        opacity: 1, x: 0, y: 0, scale: 1, duration: 0.9, ease: EASE,
        stagger: isMobile() ? 0.07 : 0.1, scrollTrigger: { trigger: group, start: "top 85%", once: true },
        onComplete: () => kids.forEach((k) => {
          k.classList.remove("reveal", "reveal-left", "reveal-right", "reveal-scale");
          gsap.set(k, { clearProps: "all" });
        })
      });
    });
    root.querySelectorAll(".media-frame img, .g-item img").forEach((img) => {
      if (isRevealed(img)) return;
      markRevealed(img);
      bindImage(img);
    });
  }

  /* =========================================================
     ROOM CARDS — entrance stagger (re-binds after re-render)
     ========================================================= */
  function bindRoomGrid() {
    document.querySelectorAll("#roomGrid").forEach((grid) => {
      const cards = Array.from(grid.querySelectorAll(".room-card")).filter((c) => !isRevealed(c));
      if (!cards.length) return;
      cards.forEach((c) => markRevealed(c));
      gsap.fromTo(cards, { y: isMobile() ? 40 : 60, autoAlpha: 0 }, {
        y: 0, autoAlpha: 1, duration: 1.0, ease: EASE, stagger: isMobile() ? 0.09 : 0.14,
        scrollTrigger: { trigger: grid, start: "top 82%", once: true },
        onComplete: () => {
          cards.forEach((c) => c.classList.remove("reveal"));
          gsap.set(cards, { clearProps: "all" });
        }
      });
    });
  }

  /* =========================================================
     INJECTED CONTENT — room/gallery/menu grids render async and
     re-render on language change; bind reveals for new nodes.
     ========================================================= */
  function watchInjected() {
    let pending = false;
    const boundCount = () => document.querySelectorAll("[data-revealed]").length;
    const mo = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        const before = boundCount();
        bindReveals(document);
        bindRoomGrid();
        if (boundCount() > before) ScrollTrigger.refresh();
      }, 180);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* =========================================================
     PARALLAX (backgrounds / media) — scrubbed, gentle
     ========================================================= */
  function parallax() {
    if (isMobile()) return;
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
    gsap.fromTo(cols, { y: isMobile() ? 28 : 40, autoAlpha: 0 }, {
      y: 0, autoAlpha: 1, duration: 0.9, ease: EASE, stagger: isMobile() ? 0.07 : 0.1,
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
    bindReveals(document);
    bindRoomGrid();
    parallax();
    guestVoices();
    footerReveal();
    booking();
    navActive();
    magnetic();
    progressBar();
    heroParallax();
    watchInjected();
    ScrollTrigger.refresh();
    heroBootstrap();
  }

  /* DOM-ready hookup: readyState check means DOMContentLoaded is never
     missed even if it already fired before this script ran. */
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  engineInitialized = true;   // guard set ONLY after full success
  return true;
    } catch (err) {
      console.error("[MG Animations] engine init failed:", err);
      failSafe();
      return false;
    }
  }

  /* ---------- fail-safe: engine could not start for any reason ----------
     Force every element back to visible/untouched so the page is never
     left in an animation start state (broken hero title, hidden content). */
  function failSafe() {
    if (failSafeApplied) return;
    failSafeApplied = true;
    root.classList.remove("has-anim");
    root.classList.remove("is-loading");
    const sel = "[data-reveal], .reveal, .reveal-left, .reveal-right, .reveal-scale, .mask-reveal, .img-reveal, .hero__cta > *, .hero .eyebrow, .hero__sub, .navbar, .scroll-indicator, .float-deco";
    document.querySelectorAll(sel).forEach((el) => el.removeAttribute("style"));
    document.querySelectorAll(".hero__title .line > span, .hero__title span").forEach((el) => {
      el.style.transform = "none";
      el.style.opacity = "1";
    });
    window.__playHero = function () {
      if (window.__heroPlayed) return;
      window.__heroPlayed = true;
    };
  }

  /* ---------- hero bootstrap: play as soon as the loader has exited ---------- */
  function heroBootstrap() {
    if (window.__heroPlayed) return;
    if (root.classList.contains("is-loading")) return; // app.js calls __playHero() when the loader exits
    window.__playHero();
  }

  /* =========================================================
     BOOTSTRAP — idempotent, invoked from every readiness path.
       1) immediately, if dependencies + DOM are already available
       2) DOMContentLoaded (never missed — readyState check above)
       3) continuous dependency polling until success or displayed timeout
     initAnimationEngine() is idempotent (engineInitialized), so any
     number of redundant calls still result in EXACTLY ONE engine init.
     ========================================================= */
  if (!initAnimationEngine()) {
    let tries = 0;
    const MAX_TRIES = 200;   // 100ms x 200 = 20s of continuous polling
    const poll = setInterval(() => {
      if (initAnimationEngine()) { clearInterval(poll); return; }
      tries += 1;
      if (tries >= MAX_TRIES) {
        clearInterval(poll);
        failSafe();
      }
    }, 100);
  }
})();
