/* =========================================================
   site-menu.js — Renders the Dining / Restaurant menu grid from
   the shared data layer (Firestore `menu` -> demo seed fallback).
   Used by: homepage #diningMenu.
   No UI/design change: reuses existing .card / .grid / .badge styles.
   Maps 1:1 to the Admin "Restaurant" (menu) CRUD fields:
     name, category, price, desc  (+ optional active/status flag)
   ========================================================= */
(function () {
  "use strict";

  var esc = window.MGShared && MGShared.esc;

  function isActive(it) {
    if (it.active === false) return false;
    if (it.status && /inactive|hidden|off|draft/i.test(it.status)) return false;
    return true; // admin menu has no active flag by default -> show all
  }

  function cardHTML(it) {
    const name = esc(it.name || "");
    const cat = esc(it.category || "");
    const price = esc(it.price || "");
    const desc = esc(it.desc || "");
    return `<article class="card menu-card reveal" data-category="${cat}">
      <div class="menu-card__head">
        <h3 class="fs-h4 menu-card__name">${name}</h3>
        ${price ? `<span class="menu-card__price">${price}</span>` : ""}
      </div>
      ${cat ? `<span class="badge menu-card__cat">${cat}</span>` : ""}
      ${desc ? `<p class="text-muted menu-card__desc">${desc}</p>` : ""}
    </article>`;
  }

  function renderFilters(container, cats, onPick) {
    const wrap = document.getElementById("menuFilters");
    if (!wrap) return;
    wrap.innerHTML = `<button class="menu-filter is-active" data-cat="all">All</button>` +
      cats.map(c => `<button class="menu-filter" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
    wrap.querySelectorAll(".menu-filter").forEach(btn => {
      btn.addEventListener("click", () => {
        wrap.querySelectorAll(".menu-filter").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        onPick(btn.dataset.cat);
      });
    });
  }

  function applyFilter(cat) {
    const grid = document.getElementById("diningMenu");
    if (!grid) return;
    grid.querySelectorAll(".menu-card").forEach(card => {
      const show = cat === "all" || card.dataset.category === cat;
      card.style.display = show ? "" : "none";
    });
  }

  async function render() {
    const grid = document.getElementById("diningMenu");
    if (!grid) return;
    const loading = document.getElementById("menuLoading");
    const empty = document.getElementById("menuEmpty");
    const error = document.getElementById("menuError");

    if (loading) loading.hidden = false;
    if (empty) empty.hidden = true;
    if (error) error.hidden = true;

    let items = [];
    try {
      items = await (window.MGSiteData
        ? window.MGSiteData.getList("menu")
        : (window.__mgSeed ? window.__mgSeed().menu : [])) || [];
    } catch (e) {
      if (loading) loading.hidden = true;
      if (error) { error.hidden = false; error.textContent = "We couldn't load the menu. Please refresh."; }
      console.error("[site-menu] failed to load menu:", e);
      return;
    }

    if (loading) loading.hidden = true;
    const visible = items.filter(isActive);

    if (!visible.length) {
      grid.innerHTML = "";
      if (empty) empty.hidden = false;
      const f = document.getElementById("menuFilters");
      if (f) f.innerHTML = "";
      return;
    }
    if (empty) empty.hidden = true;

    grid.innerHTML = visible.map(cardHTML).join("");

    const cats = [...new Set(visible.map(it => it.category).filter(Boolean))].sort();
    renderFilters(grid, cats, applyFilter);
    applyFilter("all");
  }

  window.MGSiteMenu = { render: render };

  function init() {
    if (!window.MGSiteData) return;
    render();
    if (window.MGLang) document.addEventListener("lang:change", render);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
