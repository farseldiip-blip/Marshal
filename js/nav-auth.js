(function () {
  "use strict";

  function rootPath() {
    var path = window.location.pathname;
    return path.indexOf("/pages/") !== -1 ? "../" : "";
  }

  function translate(key) {
    if (window.MGLang && window.MGLang.t) return window.MGLang.t(key);
    return key;
  }

  function updateNav() {
    var token = localStorage.getItem("mg-user-jwt");
    if (!token) { setGuestNav(); return; }

    var api = window.MGCustomerApi;
    if (!api) { setGuestNav(); return; }

    api.me().then(function (user) {
      if (user && user.role === "ADMIN") {
        setAdminNav();
      } else if (user) {
        setUserNav(user);
      } else {
        setGuestNav();
      }
    }).catch(function () {
      setGuestNav();
    });
  }

  function setGuestNav() {
    var root = rootPath();
    var href = root + "pages/account.html";
    var text = translate("nav_login") || "Login";
    updateLinks(href, text);
  }

  function setUserNav(user) {
    var root = rootPath();
    var href = root + "pages/account.html";
    var text = translate("nav_account") || "My Account";
    updateLinks(href, text);
  }

  function setAdminNav() {
    var root = rootPath();
    var href = root + "admin.html";
    var text = translate("nav_admin") || "Dashboard";
    updateLinks(href, text);
  }

  function updateLinks(href, text) {
    var links = document.querySelectorAll(".nav-login, .mobile-menu a[data-i18n='nav_login']");
    for (var i = 0; i < links.length; i++) {
      var el = links[i];
      el.setAttribute("href", href);
      var label = el.querySelector(".nav-login__label");
      if (label) label.textContent = text;
      else el.textContent = text;
      el.setAttribute("aria-label", text);
      el.setAttribute("data-i18n", "");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateNav);
  } else {
    updateNav();
  }

  document.addEventListener("lang:change", function () {
    var token = localStorage.getItem("mg-user-jwt");
    if (token && window.MGCustomerApi) {
      window.MGCustomerApi.me().then(function (user) {
        if (user && user.role === "ADMIN") {
          setAdminNav();
        } else if (user) {
          setUserNav(user);
        } else {
          setGuestNav();
        }
      }).catch(function () {
        setGuestNav();
      });
    } else {
      setGuestNav();
    }
  });
})();
