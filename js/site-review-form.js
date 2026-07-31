/* =========================================================
   site-review-form.js — Public "Write a Review" modal form.
   ---------------------------------------------------------
   Submits to POST /api/reviews (rate-limited, validated).
   Review is created as PENDING — never displayed publicly
   until admin publishes.
   ========================================================= */
(function () {
  "use strict";

  var _submitting = false;

  /* ---- Escape HTML for XSS safety ---- */
  // shared.js is always loaded before this file (verified in all HTML pages).
  var esc = MGShared.esc;

  /* ---- DOM refs ---- */
  function getModal() { return document.getElementById("reviewModal"); }
  function getForm() { return document.getElementById("reviewForm"); }

  /* ---- Open / Close modal ---- */
  function openModal() {
    var modal = getModal();
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    // Focus first input
    var nameInput = document.getElementById("rvName");
    if (nameInput) setTimeout(function () { nameInput.focus(); }, 100);
  }

  function closeModal() {
    var modal = getModal();
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
    resetForm();
  }

  function resetForm() {
    var form = getForm();
    if (form) form.reset();
    var ratingInput = document.getElementById("rvRating");
    if (ratingInput) ratingInput.value = "0";
    // Reset star visual
    var stars = document.querySelectorAll(".rv-star");
    for (var i = 0; i < stars.length; i++) stars[i].classList.remove("active");
    // Hide errors/success
    var err = document.getElementById("rvGeneralError");
    if (err) err.hidden = true;
    var ratingErr = document.getElementById("rvRatingError");
    if (ratingErr) ratingErr.hidden = true;
    var success = document.getElementById("rvSuccess");
    if (success) success.hidden = true;
    var submitBtn = document.getElementById("rvSubmitBtn");
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = getLocalizedString("tst_submit"); }
    _submitting = false;
  }

  function getLocalizedString(key) {
    if (window.__I18N_ACTIVE && window.__I18N_ACTIVE[key]) return window.__I18N_ACTIVE[key];
    if (window.__I18N_EN && window.__I18N_EN[key]) return window.__I18N_EN[key];
    return "";
  }

  /* ---- Star rating interaction ---- */
  function initStars() {
    var container = document.getElementById("rvStars");
    var ratingInput = document.getElementById("rvRating");
    if (!container || !ratingInput) return;
    var stars = container.querySelectorAll(".rv-star");

    function setActive(n) {
      ratingInput.value = n;
      for (var i = 0; i < stars.length; i++) {
        stars[i].classList.toggle("active", i < n);
      }
      // Hide rating error when a star is selected
      var ratingErr = document.getElementById("rvRatingError");
      if (ratingErr) ratingErr.hidden = true;
    }

    for (var i = 0; i < stars.length; i++) {
      (function (idx) {
        stars[idx].addEventListener("click", function (e) {
          e.preventDefault();
          setActive(idx + 1);
        });
        stars[idx].addEventListener("mouseenter", function () {
          for (var j = 0; j < stars.length; j++) {
            stars[j].classList.toggle("hover", j <= idx);
          }
        });
        stars[idx].addEventListener("mouseleave", function () {
          for (var j = 0; j < stars.length; j++) stars[j].classList.remove("hover");
        });
      })(i);
    }

    container.addEventListener("mouseleave", function () {
      var val = parseInt(ratingInput.value, 10) || 0;
      for (var j = 0; j < stars.length; j++) stars[j].classList.toggle("active", j < val);
    });
  }

  /* ---- Client-side validation ---- */
  function validate() {
    var name = (document.getElementById("rvName").value || "").trim();
    var rating = parseInt(document.getElementById("rvRating").value, 10);
    var review = (document.getElementById("rvReview").value || "").trim();
    var email = (document.getElementById("rvEmail").value || "").trim();
    var errors = [];

    if (!name) errors.push(getLocalizedString("tst_error_name") || "Please enter your name");
    if (name.length > 100) errors.push("Name is too long");
    if (!rating || rating < 1 || rating > 5) {
      var ratingErr = document.getElementById("rvRatingError");
      if (ratingErr) ratingErr.hidden = false;
      errors.push(getLocalizedString("tst_error_rating") || "Please select a rating");
    }
    if (!review || review.length < 10) errors.push(getLocalizedString("tst_error_review_short") || "Review must be at least 10 characters");
    if (review.length > 2000) errors.push("Review is too long (max 2000 characters)");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(getLocalizedString("tst_error_email") || "Please enter a valid email");
    }
    return errors;
  }

  function showErrors(errors) {
    var el = document.getElementById("rvGeneralError");
    if (!el) return;
    if (!errors.length) { el.hidden = true; return; }
    el.textContent = errors[0];
    el.hidden = false;
  }

  /* ---- Submit ---- */
  function handleSubmit(e) {
    e.preventDefault();
    if (_submitting) return;

    var errors = validate();
    if (errors.length) { showErrors(errors); return; }

    var name = (document.getElementById("rvName").value || "").trim();
    var email = (document.getElementById("rvEmail").value || "").trim() || null;
    var rating = parseInt(document.getElementById("rvRating").value, 10);
    var review = (document.getElementById("rvReview").value || "").trim();

    _submitting = true;
    var submitBtn = document.getElementById("rvSubmitBtn");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = getLocalizedString("tst_submitting") || "Submitting…"; }

    var payload = { name: name, rating: rating, review: review };
    if (email) payload.email = email;

    // Use API client if available, otherwise raw fetch
    var apiBase = (window.MGApiConfig && window.MGApiConfig.baseUrl) || "http://localhost:8080/api";

    fetch(apiBase + "/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(function (res) {
      return res.json().then(function (json) {
        return { status: res.status, json: json };
      });
    })
    .then(function (result) {
      if (result.status === 429) {
        showErrors([getLocalizedString("tst_error_rate") || "Too many submissions. Please try again later."]);
        _submitting = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = getLocalizedString("tst_submit"); }
        return;
      }
      if (result.status === 422 || result.status === 400) {
        var msg = (result.json && result.json.error && result.json.error.message) || "Validation failed";
        showErrors([msg]);
        _submitting = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = getLocalizedString("tst_submit"); }
        return;
      }
      if (!result.json || !result.json.ok) {
        showErrors([getLocalizedString("tst_error_generic") || "Something went wrong. Please try again."]);
        _submitting = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = getLocalizedString("tst_submit"); }
        return;
      }
      // Success
      var form = getForm();
      if (form) form.reset();
      var ratingInput = document.getElementById("rvRating");
      if (ratingInput) ratingInput.value = "0";
      var stars = document.querySelectorAll(".rv-star");
      for (var i = 0; i < stars.length; i++) stars[i].classList.remove("active");
      showErrors([]);
      var success = document.getElementById("rvSuccess");
      if (success) success.hidden = false;
      if (submitBtn) submitBtn.style.display = "none";
      // Close modal after delay
      setTimeout(closeModal, 3500);
    })
    .catch(function () {
      showErrors([getLocalizedString("tst_error_network") || "Network error. Please check your connection."]);
      _submitting = false;
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = getLocalizedString("tst_submit"); }
    });
  }

  /* ---- Init ---- */
  function init() {
    // Open button
    var openBtn = document.getElementById("openReviewModal");
    if (openBtn) openBtn.addEventListener("click", openModal);

    // Close buttons
    var closeEls = document.querySelectorAll("[data-review-close]");
    for (var i = 0; i < closeEls.length; i++) {
      closeEls[i].addEventListener("click", closeModal);
    }

    // Escape key
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var modal = getModal();
        if (modal && !modal.hidden) closeModal();
      }
    });

    // Star rating
    initStars();

    // Form submit
    var form = getForm();
    if (form) form.addEventListener("submit", handleSubmit);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
