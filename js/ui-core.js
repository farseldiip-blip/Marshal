/* =========================================================
   ui-core.js — lightweight, CDN-independent UI behaviors.
   Loaded with `defer` so it always runs, even if the GSAP /
   Lenis / Swiper CDNs are slow, blocked, or offline.
   Handles: stat counters + marquee scroll.
   ========================================================= */
(function () {
  "use strict";

  /* ---------- Stat counters ---------- */
  function counters() {
    var nums = Array.prototype.slice.call(
      document.querySelectorAll(".stat__num[data-target]")
    );
    if (!nums.length) return;

    function animate(el) {
      var target = parseFloat(el.getAttribute("data-target"));
      if (isNaN(target)) return;
      var suffix = el.getAttribute("data-suffix") || "";
      var duration = 1800;
      var start = performance.now();

      function tick(now) {
        var p = Math.min((now - start) / duration, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        var val = target * eased;
        el.textContent =
          (target % 1 === 0 ? Math.round(val) : val.toFixed(1)) + suffix;
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = (target % 1 === 0 ? target : target.toFixed(1)) + suffix;
      }
      requestAnimationFrame(tick);
    }

    if (!("IntersectionObserver" in window)) {
      nums.forEach(animate);
      return;
    }
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animate(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    nums.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Marquee ----------
     Handled entirely in CSS (see animations.css .marquee__track +
     @keyframes marquee-scroll) using the duplicated-track technique,
     so there is no JS transform fighting the CSS animation. */

  function start() {
    counters();
  }

  // The stat markup lives earlier in the document body, so by the time this
  // (bottom-of-body) script runs the nodes already exist. Start immediately
  // instead of waiting for DOMContentLoaded — that event can be delayed
  // indefinitely if an external CDN script hangs.
  if (document.querySelector(".stat__num[data-target]")) {
    start();
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
