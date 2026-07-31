(function () {
  "use strict";

  var api = window.MGCustomerApi;
  var t = function (key, en, ar) {
    return window.MGLang && window.MGLang.t ? window.MGLang.t(key) : (en || key);
  };

  var els = {};
  var currentUser = null;

  var ROOM_GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>';

  window.MGImgFallback = function (imgEl) {
    if (!imgEl || !imgEl.parentNode) return;
    var box = imgEl.parentNode;
    imgEl.remove();
    box.classList.add("is-fallback");
    box.innerHTML = ROOM_GLYPH;
  };

  function q(id) { return document.getElementById(id); }

  function init() {
    els.authView = q("authView");
    els.registerView = q("registerView");
    els.accountView = q("accountView");
    els.loginForm = q("loginForm");
    els.registerForm = q("registerForm");
    els.loginBtn = q("loginBtn");
    els.registerBtn = q("registerBtn");
    els.authError = q("authError");
    els.authSuccess = q("authSuccess");
    els.regError = q("regError");
    els.regSuccess = q("regSuccess");
    els.showRegister = q("showRegister");
    els.showLogin = q("showLogin");
    els.logoutBtn = q("logoutBtn");
    els.acUserName = q("acUserName");
    els.acAvatar = q("acAvatar");
    els.accountBookings = q("accountBookings");

    els.showRegister.addEventListener("click", showRegisterView);
    els.showLogin.addEventListener("click", showLoginView);
    els.loginForm.addEventListener("submit", handleLogin);
    els.registerForm.addEventListener("submit", handleRegister);
    els.logoutBtn.addEventListener("click", handleLogout);

    checkAuth();
  }

  function checkAuth() {
    if (!api) { showLoginView(); return; }
    var token = api.getToken();
    if (!token) { showLoginView(); return; }

    api.me().then(function (user) {
      if (!user) { showLoginView(); return; }
      if (user.role === "ADMIN") {
        window.location.href = "../admin.html";
        return;
      }
      currentUser = user;
      showAccountView(user);
    }).catch(function () {
      api.clearToken();
      showLoginView();
    });
  }

  function showView(viewId) {
    var views = ["authView", "registerView", "accountView"];
    for (var i = 0; i < views.length; i++) {
      var el = q(views[i]);
      if (el) el.classList.toggle("active", views[i] === viewId);
    }
  }

  function showLoginView() {
    showView("authView");
    hideMessage(els.authError);
    hideMessage(els.authSuccess);
  }

  function showRegisterView() {
    showView("registerView");
    hideMessage(els.regError);
    hideMessage(els.regSuccess);
  }

  function showAccountView(user) {
    showView("accountView");
    var name = user.name || user.email || "";
    els.acUserName.textContent = name;
    els.acAvatar.textContent = name.charAt(0).toUpperCase();
    loadBookings();
  }

  function handleLogin(e) {
    e.preventDefault();
    var email = q("loginEmail").value.trim();
    var password = q("loginPassword").value;

    if (!email || !password) {
      showError(els.authError, "Please enter your email and password.");
      return;
    }

    hideMessage(els.authError);
    setLoading(els.loginBtn, true, t("auth_signin") || "Sign In");

    api.login(email, password).then(function (res) {
      setLoading(els.loginBtn, false, t("auth_signin") || "Sign In");
      if (res.user) {
        if (res.user.role === "ADMIN") {
          if (window.MGApiClient && window.MGApiClient.setToken && res.token) {
            window.MGApiClient.setToken(res.token);
          }
          window.location.href = "../admin.html";
        } else {
          currentUser = res.user;
          showAccountView(res.user);
        }
      } else {
        location.reload();
      }
    }).catch(function (err) {
      setLoading(els.loginBtn, false, t("auth_signin") || "Sign In");
      showError(els.authError, err.message || (t("auth_login_error") || "Invalid email or password."));
    });
  }

  function handleRegister(e) {
    e.preventDefault();
    var name = q("regName").value.trim();
    var email = q("regEmail").value.trim();
    var phone = q("regPhone").value.trim();
    var password = q("regPassword").value;

    if (!name || !email || !password) {
      showError(els.regError, "Please fill in all required fields.");
      return;
    }
    if (password.length < 6) {
      showError(els.regError, "Password must be at least 6 characters.");
      return;
    }

    hideMessage(els.regError);
    setLoading(els.registerBtn, true, t("auth_signup") || "Create Account");

    var data = { name: name, email: email, password: password };
    if (phone) data.phone = phone;

    api.register(data).then(function () {
      setLoading(els.registerBtn, false, t("auth_signup") || "Create Account");
      showSuccess(els.regSuccess, t("auth_register_success") || "Account created! You can now sign in.");
      els.registerForm.reset();
    }).catch(function (err) {
      setLoading(els.registerBtn, false, t("auth_signup") || "Create Account");
      showError(els.regError, err.message || (t("auth_register_error") || "Could not create account."));
    });
  }

  function handleLogout() {
    api.logout();
    currentUser = null;
    showLoginView();
  }

  function loadBookings() {
    els.accountBookings.innerHTML = '<div class="booking-loader"><div class="spinner"></div><p>' + (t("ac_loading") || "Loading your reservations\u2026") + '</p></div>';

    api.getMyBookings().then(function (bookings) {
      if (!bookings || !bookings.length) {
        renderEmpty();
        return;
      }
      renderBookings(bookings);
    }).catch(function () {
      els.accountBookings.innerHTML = '<div class="account-error"><p>' + (t("ac_error") || "Could not load reservations.") + '</p><a href="../index.html#booking" class="btn btn--primary">' + (t("ac_book_now") || "Book a Stay") + '</a></div>';
    });
  }

  function categorizeBookings(bookings) {
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var upcoming = [], past = [], cancelled = [];
    for (var i = 0; i < bookings.length; i++) {
      var b = bookings[i];
      if ((b.status || "Pending").toUpperCase() === "CANCELLED") {
        cancelled.push(b);
        continue;
      }
      var checkout = b.checkout ? new Date(b.checkout + "T00:00:00") : null;
      if (checkout && checkout < now) {
        past.push(b);
      } else {
        upcoming.push(b);
      }
    }
    return { upcoming: upcoming, past: past, cancelled: cancelled };
  }

  function renderBookings(bookings) {
    var cats = categorizeBookings(bookings);
    var html = "";

    if (cats.upcoming.length) {
      html += '<div class="account-dash__category">';
      html += '<div class="account-dash__category-label">' + (t("ac_upcoming") || "Upcoming") + '<span class="category-count">' + cats.upcoming.length + '</span></div>';
      for (var i = 0; i < cats.upcoming.length; i++) {
        html += buildBookingCard(cats.upcoming[i]);
      }
      html += '</div>';
    }

    if (cats.past.length) {
      html += '<div class="account-dash__category">';
      html += '<div class="account-dash__category-label">' + (t("ac_past") || "Past") + '<span class="category-count">' + cats.past.length + '</span></div>';
      for (var i = 0; i < cats.past.length; i++) {
        html += buildBookingCard(cats.past[i]);
      }
      html += '</div>';
    }

    if (cats.cancelled.length) {
      html += '<div class="account-dash__category">';
      html += '<div class="account-dash__category-label account-dash__category-label--muted">' + (t("d_cancelled") || "Cancelled") + '<span class="category-count">' + cats.cancelled.length + '</span></div>';
      for (var i = 0; i < cats.cancelled.length; i++) {
        html += buildBookingCard(cats.cancelled[i]);
      }
      html += '</div>';
    }

    if (!cats.upcoming.length && !cats.past.length && !cats.cancelled.length) {
      renderEmpty();
      return;
    }

    els.accountBookings.innerHTML = html;
  }

  function buildBookingCard(b) {
    var status = (b.status || "Pending").toLowerCase().replace(/\s+/g, "_");
    var guests = b.guests || (Number(b.adults) || 0) + (Number(b.children) || 0);
    var fromDate = formatDate(b.checkin);
    var toDate = formatDate(b.checkout);
    var nights = b.nights || nightsBetween(b.checkin, b.checkout);
    var total = b.total ? formatMoney(b.total) : "";
    var ref = b.reference || b.id || "";

    var html = '<div class="booking-card">';
    html += '<div class="booking-card__inner">';

    var img = b.image || (b.images && b.images[0]) || "";
    html += '<div class="booking-card__image' + (img ? "" : " is-placeholder") + '">';
    if (img) {
      html += '<img src="' + esc(img) + '" alt="' + esc(b.roomName || "") + '" loading="lazy" onerror="MGImgFallback(this)">';
    } else {
      html += ROOM_GLYPH;
    }
    html += '</div>';

    html += '<div class="booking-card__body">';
    html += '<div class="booking-card__room-name">' + esc(b.roomName || "") + '</div>';
    if (ref) {
      var refLabel = t("ac_ref") || "Reference";
      html += '<div class="booking-card__ref">' + esc(refLabel) + ': <span>' + esc(ref) + '</span></div>';
    }
    html += '<div class="booking-card__details">';
    if (b.checkin && b.checkout) {
      html += '<span class="booking-card__detail-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4m8-4v4"/></svg>' + esc(fromDate) + ' — ' + esc(toDate) + '</span>';
    }
    if (nights) {
      html += '<span class="booking-card__detail-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/></svg>' + esc(nights) + ' ' + (t("ac_nights") || "nights") + '</span>';
    }
    if (guests) {
      html += '<span class="booking-card__detail-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' + esc(guests) + ' ' + (t("ac_guests") || "Guests") + '</span>';
    }
    html += '</div>';
    html += '</div>';

    html += '<div class="booking-card__right">';
    html += '<div class="status-badge status-badge--' + status + '">' + esc(b.status || "Pending") + '</div>';
    if (total) {
      html += '<div class="booking-card__price">' + total + '</div>';
    }
    html += '<div class="booking-card__actions">';
    html += '<a href="../index.html#booking" class="btn--view">' + (t("ac_view_details") || "View Details") + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg></a>';
    html += '</div>';
    html += '</div>';

    html += '</div>';
    html += '</div>';
    return html;
  }

  function renderEmpty() {
    els.accountBookings.innerHTML = '<div class="account-empty">'
      + '<div class="account-empty__icon"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v3m8-3v3M2 9h20"/><circle cx="12" cy="14" r="1"/><path d="M16 17a4 4 0 01-8 0"/></svg></div>'
      + '<h3>' + (t("ac_no_bookings") || "No reservations yet") + '</h3>'
      + '<p>' + (t("ac_no_bookings_sub") || "Your upcoming and previous stays will appear here.") + '</p>'
      + '<a href="../index.html#booking" class="btn btn--primary">' + (t("ac_book_now") || "Book a Stay") + '</a>'
      + '</div>';
  }

  function nightsBetween(checkin, checkout) {
    if (!checkin || !checkout) return 0;
    var ci = new Date(checkin + "T00:00:00");
    var co = new Date(checkout + "T00:00:00");
    var diff = (co - ci) / 86400000;
    return diff > 0 ? Math.round(diff) : 0;
  }

  var ERROR_KEYS = {
    "Invalid email or password": "auth_login_error",
    "Account is inactive": "auth_account_inactive",
    "email_already_registered": "auth_email_exists",
    "invalid_credentials": "auth_login_error"
  };

  function localizeError(msg) {
    var key = ERROR_KEYS[msg];
    if (key) return t(key);
    return msg;
  }

  function showError(el, msg) {
    if (!el) return;
    el.textContent = localizeError(msg);
    el.classList.add("show");
  }

  function showSuccess(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
  }

  function hideMessage(el) {
    if (!el) return;
    el.textContent = "";
    el.classList.remove("show");
  }

  function setLoading(btn, isLoading, originalText) {
    if (!btn) return;
    if (isLoading) {
      btn.classList.add("btn--loading");
      btn.disabled = true;
    } else {
      btn.classList.remove("btn--loading");
      btn.disabled = false;
    }
  }

  function esc(s) {
    if (typeof s !== "string") return String(s || "");
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function formatDate(d) {
    if (!d) return "";
    var parts = d.split("-");
    if (parts.length === 3) return parts[2] + "/" + parts[1] + "/" + parts[0];
    var dt = new Date(d);
    if (!isNaN(dt)) {
      var dd = String(dt.getDate()).padStart(2, "0");
      var mm = String(dt.getMonth() + 1).padStart(2, "0");
      var yyyy = dt.getFullYear();
      return dd + "/" + mm + "/" + yyyy;
    }
    return d;
  }

  function formatMoney(n) {
    var num = Number(n) || 0;
    return "$" + num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
