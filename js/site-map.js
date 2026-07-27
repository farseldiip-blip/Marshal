/* =========================================================
   site-map.js — Interactive hotel location map (lazy-loaded).
   ---------------------------------------------------------
   Uses Leaflet + CARTO dark tiles with a custom premium
   marker and branded popup for Marshal Al-Gezira.

   Performance:
   - Map only initializes when the container enters the
     viewport (IntersectionObserver).
   - One map instance, one tile layer, one marker, one popup.
   - Zoom/fade animations disabled during initial render.
   - trackResize disabled; resize handled via a debounced
     invalidateSize on the observer threshold only.
   - scrollWheelZoom disabled.

   Coordinates: 31.046064599964783, 31.36448992183196
   Source of truth for everything: the constants below.
   ========================================================= */
(function () {
  "use strict";

  /* ---- Configuration (single source of truth) ---- */
  var HOTEL_LAT = 31.046064599964783;
  var HOTEL_LNG = 31.36448992183196;
  var HOTEL_NAME = "Marshal Al-Gezira";
  var HOTEL_ADDRESS = "Mansoura, Dakahlia, Egypt";
  var GOOGLE_MAPS_URL =
    "https://www.google.com/maps/search/?api=1&query=" + HOTEL_LAT + "," + HOTEL_LNG;

  /* ---- Singleton guard ---- */
  var _map = null;
  var _observer = null;

  /* ---- Build popup HTML once ---- */
  var POPUP_HTML =
    '<div class="hotel-popup" role="tooltip">' +
      '<div class="hotel-popup__name">' + HOTEL_NAME + '</div>' +
      '<div class="hotel-popup__address">' + HOTEL_ADDRESS + '</div>' +
      '<a class="hotel-popup__cta" href="' + GOOGLE_MAPS_URL + '" target="_blank" rel="noopener noreferrer" tabindex="0">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>' +
        '</svg>' +
        '<span>View on Google Maps</span>' +
      '</a>' +
    '</div>';

  /* ---- Build marker SVG once ---- */
  var MARKER_HTML =
    '<svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M18 0C8.06 0 0 8.06 0 18c0 12.6 18 26 18 26s18-13.4 18-26C36 8.06 27.94 0 18 0z" fill="#C6A15B"/>' +
      '<circle cx="18" cy="17" r="8" fill="#0B0D12" stroke="#E7D8B8" stroke-width="1.5"/>' +
      '<text x="18" y="21" text-anchor="middle" fill="#C6A15B" font-family="Playfair Display,Georgia,serif" font-size="10" font-weight="600">M</text>' +
    '</svg>';

  /* ---- Initialize the map (called once, lazily) ---- */
  function createMap() {
    if (_map) return;                        // singleton — never re-init
    var container = document.getElementById("hotelMap");
    if (!container || typeof L === "undefined") return;

    /* One map instance, all heavy animations off at start */
    _map = L.map(container, {
      center:           [HOTEL_LAT, HOTEL_LNG],
      zoom:             15,
      scrollWheelZoom:  false,
      attributionControl: false,
      zoomAnimation:    false,
      fadeAnimation:    false,
      trackResize:      false,               // we handle resize ourselves
      keyboard:         true,
      keyboardPanDelta: 100
    });

    /* One tile layer — CARTO dark (lightweight raster) */
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom:    19,
      subdomains: "abcd",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
    }).addTo(_map);

    /* One marker, one popup — created once, never recreated */
    var goldIcon = L.divIcon({
      className:   "hotel-marker",
      iconSize:    [36, 44],
      iconAnchor:  [18, 44],
      popupAnchor: [0, -48],
      html:        MARKER_HTML
    });

    var marker = L.marker([HOTEL_LAT, HOTEL_LNG], {
      icon:       goldIcon,
      interactive: true,
      keyboard:   true,
      alt:        HOTEL_NAME + " location"
    }).addTo(_map);

    marker.bindPopup(POPUP_HTML, {
      closeButton:  true,
      className:    "hotel-popup-wrapper",
      maxWidth:     280,
      offset:       [0, -8],
      autoPan:      false                   // no expensive pan on open
    });

    /* Hover / click → open the same popup instance */
    marker.on("mouseover", function () { marker.openPopup(); });
    marker.on("click",     function () { marker.openPopup(); });

    /* Keyboard: Enter / Space */
    marker.on("keydown", function (e) {
      var key = e.originalEvent.key;
      if (key === "Enter" || key === " ") {
        e.originalEvent.preventDefault();
        marker.openPopup();
      }
    });

    /* Attribution — one control, bottom-right */
    L.control.attribution({ position: "bottomright" }).addTo(_map);

    /*
     * After the map is in the DOM and visible, tell Leaflet
     * the correct size.  A single rAF + 200 ms settle is
     * enough; no continuous resize handler is needed.
     */
    requestAnimationFrame(function () {
      _map.invalidateSize({ animate: false });
    });
  }

  /* ---- Debounced resize handler (only while map exists) ---- */
  var _resizeTimer = null;
  function onResize() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function () {
      if (_map) _map.invalidateSize({ animate: false });
    }, 200);
  }

  /* ---- Lazy-init via IntersectionObserver ---- */
  function observe() {
    var target = document.getElementById("hotelMap");
    if (!target) return;

    /* Modern browsers */
    if ("IntersectionObserver" in window) {
      _observer = new IntersectionObserver(
        function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
              _observer.disconnect();
              _observer = null;
              createMap();
              window.addEventListener("resize", onResize, { passive: true });
              break;
            }
          }
        },
        { rootMargin: "300px 0px" }          // start 300 px before visible
      );
      _observer.observe(target);
    } else {
      /* Fallback: just init immediately */
      createMap();
      window.addEventListener("resize", onResize, { passive: true });
    }
  }

  /* ---- Bootstrap ---- */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observe);
  } else {
    observe();
  }

  /* ---- Public API (unchanged) ---- */
  window.MGHotelMap = {
    init:     createMap,
    coords:   [HOTEL_LAT, HOTEL_LNG],
    googleUrl: GOOGLE_MAPS_URL
  };
})();
