/* =========================================================
   i18n.js — Internationalization engine
   - Dictionaries come from js/i18n/en.js + js/i18n/ar.js
   - Translates [data-i18n], placeholders, <option>s
   - Switches dir/lang/font instantly, no reload
   - Fires "lang:change" so injected lists re-render
   ========================================================= */
(function () {
  "use strict";

  const EN = window.__I18N_EN || {};
  const AR = window.__I18N_AR || {};
  const DICTS = { en: EN, ar: AR };

  const root = document.documentElement;
  const FONT_AR = '"IBM Plex Sans Arabic", "Alexandria", "Noto Naskh Arabic", "Playfair Display", serif';
  const FONT_EN = '';

  let lang = (localStorage.getItem("mg-lang") || "en");

  function captureOriginal(el) {
    if (el.__i18nOriginal != null) return;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") {
      el.__i18nOriginal = el.getAttribute("placeholder") || "";
    } else if (el.children.length === 0) {
      el.__i18nOriginal = el.textContent;
    } else {
      const first = el.childNodes[0];
      el.__i18nOriginal = (first && first.nodeType === Node.TEXT_NODE) ? first.nodeValue : "";
    }
  }

  function translateEl(el, l) {
    captureOriginal(el);
    const key = el.getAttribute("data-i18n");
    const val = (DICTS[l] && DICTS[l][key] != null) ? DICTS[l][key]
              : (l === "en" && EN[key] != null) ? EN[key]
              : (l === "en" ? el.__i18nOriginal : null);
    if (val == null) return;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") {
      if (document.activeElement !== el && !el.value) el.setAttribute("placeholder", val);
    } else if (el.children.length === 0) {
      el.textContent = val;
    } else {
      const first = el.childNodes[0];
      if (first && first.nodeType === Node.TEXT_NODE) first.nodeValue = val;
      else el.insertBefore(document.createTextNode(val), el.firstChild);
    }
  }

  function applyLang(l) {
    lang = l;
    root.setAttribute("lang", l);
    root.setAttribute("dir", l === "ar" ? "rtl" : "ltr");
    root.style.fontFamily = l === "ar" ? FONT_AR : FONT_EN;
    document.querySelectorAll("[data-i18n]").forEach(el => translateEl(el, l));
    document.querySelectorAll("option[data-i18n]").forEach(el => translateEl(el, l));
    const toggle = document.getElementById("langToggle");
    if (toggle) {
      const label = toggle.querySelector(".lang-toggle__label");
      const text = l === "ar" ? "ع / EN" : "EN / ع";
      if (label) label.textContent = text;
      else toggle.textContent = text;
    }
    const toggle2 = document.getElementById("dashLangToggle");
    if (toggle2) toggle2.textContent = l === "ar" ? "EN / ع" : "ع / EN";
    localStorage.setItem("mg-lang", l);
    document.dispatchEvent(new CustomEvent("lang:change", { detail: { lang: l } }));
  }

  applyLang(lang);

  const toggle = document.getElementById("langToggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      applyLang(lang === "ar" ? "en" : "ar");
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    });
  }

  window.MGLang = {
    get: () => lang,
    t: (key) => (DICTS[lang] && DICTS[lang][key] != null) ? DICTS[lang][key] : (EN[key] != null ? EN[key] : key),
    apply: applyLang,
    retranslate: () => document.querySelectorAll("[data-i18n]").forEach(el => translateEl(el, lang)),
    isReady: true
  };
  document.dispatchEvent(new CustomEvent("i18n:ready"));
})();
