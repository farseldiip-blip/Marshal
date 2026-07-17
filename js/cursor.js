/* =========================================================
   cursor.js — smooth custom cursor (desktop only)
   - Positioned via left/top, no transform conflict
   - Auto-disabled on touch / coarse pointers
   - Delegated hover detection (works for injected nodes)
   ========================================================= */
(function () {
  "use strict";

  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!fine) return; // touch device: do nothing, CSS hides cursor

  const dot = document.getElementById("cursorDot");
  const ring = document.getElementById("cursorRing");
  if (!dot || !ring) return;

  document.documentElement.classList.add("has-custom-cursor");

  let mx = window.innerWidth / 2, my = window.innerHeight / 2;
  let rx = mx, ry = my;
  let dotX = mx, dotY = my;
  let visible = false;

  // Position with rAF lerp for buttery ring, instant dot
  function render() {
    rx += (mx - rx) * 0.2;
    ry += (my - ry) * 0.2;
    dotX += (mx - dotX) * 0.35;
    dotY += (my - dotY) * 0.35;
    dot.style.left = dotX + "px";
    dot.style.top = dotY + "px";
    ring.style.left = rx + "px";
    ring.style.top = ry + "px";
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  window.addEventListener("mousemove", (e) => {
    mx = e.clientX; my = e.clientY;
    if (!visible) {
      visible = true;
      dot.style.opacity = "1";
      ring.style.opacity = "1";
    }
  }, { passive: true });

  // Only hide when the pointer truly leaves the window.
  document.addEventListener("mouseleave", () => {
    dot.style.opacity = "0";
    ring.style.opacity = "0";
    visible = false;
  });
  document.addEventListener("mouseenter", () => {
    if (!visible) { visible = true; dot.style.opacity = "1"; ring.style.opacity = "1"; }
  });

  // Delegated hover state (handles dynamically injected elements)
  const HOVER_SEL = "a, button, .g-item, .card, .amenity, input, select, textarea, [data-cursor='hover']";
  document.addEventListener("mouseover", (e) => {
    const t = e.target.closest(HOVER_SEL);
    if (t) ring.classList.add("hover");
  });
  document.addEventListener("mouseout", (e) => {
    const t = e.target.closest(HOVER_SEL);
    if (t && !t.contains(e.relatedTarget)) ring.classList.remove("hover");
  });

  // Don't hide on scroll — that caused flicker. Keep cursor visible.
})();
