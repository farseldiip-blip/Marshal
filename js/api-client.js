/* =========================================================
   api-client.js — Public + Admin REST API data client.
   ---------------------------------------------------------
   Phase 4B: Full admin adapter for dashboard migration.
   - Public reads (rooms, menu, gallery, reviews, amenities, settings)
   - Admin JWT auth (login, logout, me)
   - Admin CRUD for all dashboard collections
   - Normalization layer (backend ↔ dashboard field names)
   - 401/403 handling

   Exposes: window.MGApiClient
   ========================================================= */
(function () {
  "use strict";

  window.MGApiConfig = window.MGApiConfig || { baseUrl: "http://localhost:8080/api" };

  var TOKEN_KEY = "mg-admin-jwt";

  /* ===========================================================
     SECTION 1 — JWT Token Management
     =========================================================== */
  function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t || ""); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  /* ===========================================================
     SECTION 2 — Core fetch helpers
     =========================================================== */
  function base() { return window.MGApiConfig.baseUrl || ""; }

  function authHeaders(extra) {
    var h = Object.assign({ Accept: "application/json" }, extra || {});
    var tok = getToken();
    if (tok) h["Authorization"] = "Bearer " + tok;
    return h;
  }

  /** Generic fetch that returns { status, json }. */
  function apiFetch(method, path, body, opts) {
    opts = opts || {};
    var url = base() + "/" + path;
    if (!url || url === "/") return Promise.resolve({ status: 0, json: null });
    var headers = authHeaders(body ? { "Content-Type": "application/json" } : {});
    var fetchOpts = { method: method, headers: headers };
    if (body !== undefined && body !== null) fetchOpts.body = JSON.stringify(body);
    return fetch(url, fetchOpts).then(function (res) {
      return res.json().then(function (json) {
        return { status: res.status, json: json };
      }).catch(function () {
        console.warn("[API] response was not JSON");
        return { status: res.status, json: null };
      });
    }).catch(function (e) {
      console.warn("[API] " + method + " " + path + " FAILED:", e.name, e.message);
      return { status: 0, json: null };
    });
  }

  function apiGet(path) { return apiFetch("GET", path); }
  function apiPost(path, body) { return apiFetch("POST", path, body); }
  function apiPut(path, body) { return apiFetch("PUT", path, body); }
  function apiDelete(path) { return apiFetch("DELETE", path); }

  /** Throw on 401/403 so callers can handle auth errors. */
  function guardAuth(res) {
    if (res.status === 401) throw new Error("SESSION_EXPIRED");
    if (res.status === 403) throw new Error("ACCESS_DENIED");
    return res;
  }

  /* ===========================================================
     SECTION 3 — Admin JWT Authentication
     =========================================================== */
  function adminLogin(email, password) {
    return apiPost("auth/login", { email: email, password: password }).then(function (res) {
      if (res.status === 0) throw new Error("Cannot connect to server at " + base());
      if (res.json && res.json.error) throw new Error(res.json.error.message || "Login failed");
      if (!res.json || !res.json.ok) throw new Error("Login failed (HTTP " + res.status + ")");
      setToken(res.json.token);
      return res.json;
    });
  }

  function adminLogout() {
    clearToken();
    return Promise.resolve();
  }

  function adminMe() {
    return apiGet("auth/me").then(guardAuth).then(function (res) {
      if (!res.json || !res.json.ok) throw new Error("AUTH_FAILED");
      return res.json.user;
    });
  }

  /** Check if current token is valid + admin. Returns user or throws. */
  function adminVerify() {
    var tok = getToken();
    if (!tok) return Promise.reject(new Error("NO_TOKEN"));
    return adminMe().then(function (user) {
      if (user.role !== "ADMIN") throw new Error("NOT_ADMIN");
      return user;
    });
  }

  /* ===========================================================
     SECTION 4 — Admin endpoint mapping
     =========================================================== */
  var ADMIN_ENDPOINTS = {
    rooms:     "admin/rooms",
    bookings:  "admin/bookings",
    menu:      "admin/menu",
    gallery:   "admin/gallery",
    reviews:   "admin/reviews",
    amenities: "admin/amenities",
    settings:  "admin/settings"
  };

  /* ===========================================================
     SECTION 5 — Admin Normalization (backend → dashboard)
     =========================================================== */

  // Enum maps: UPPERCASE (DB) → Title Case (dashboard)
  // shared.js is always loaded before this file (verified in all HTML pages).
  var BOOKING_STATUS_MAP = MGShared.STATUS_MAP;
  var PAYMENT_STATUS_MAP = MGShared.PAY_STATUS_MAP;

  // Reverse maps: Title Case (dashboard) → UPPERCASE (DB)
  var BOOKING_STATUS_REV = {};
  Object.keys(BOOKING_STATUS_MAP).forEach(function (k) { BOOKING_STATUS_REV[BOOKING_STATUS_MAP[k]] = k; });
  var PAYMENT_STATUS_REV = {};
  Object.keys(PAYMENT_STATUS_MAP).forEach(function (k) { PAYMENT_STATUS_REV[PAYMENT_STATUS_MAP[k]] = k; });

  function normBooking(b) {
    if (!b) return b;
    var out = Object.assign({}, b);
    // Field aliases: backend → dashboard
    out.guest = out.guest || out.guestName || "";
    out.room = out.room || out.roomName || "";
    out.revenue = out.revenue != null ? out.revenue : out.total;
    out.created = out.created || out.createdAt || "";
    // Enum normalization
    if (BOOKING_STATUS_MAP[b.status]) out.status = BOOKING_STATUS_MAP[b.status];
    if (PAYMENT_STATUS_MAP[b.paymentStatus]) out.paymentStatus = PAYMENT_STATUS_MAP[b.paymentStatus];
    return out;
  }

  function normBookingForApi(dashObj) {
    // Dashboard → backend: send only updatable fields
    var out = {};
    if (dashObj.status != null) out.status = BOOKING_STATUS_REV[dashObj.status] || dashObj.status;
    if (dashObj.paymentStatus != null) out.paymentStatus = PAYMENT_STATUS_REV[dashObj.paymentStatus] || dashObj.paymentStatus;
    // Pass through other fields if present
    ["guestName", "email", "phone", "checkin", "checkout", "adults", "children", "rooms"].forEach(function (k) {
      if (dashObj[k] != null) out[k] = dashObj[k];
    });
    return out;
  }

  function normRoomAdmin(r) {
    if (!r) return r;
    var out = Object.assign({}, r);
    out.desc = out.desc || out.description || "";
    // images[] → image (first)
    out.image = out.image || (Array.isArray(out.images) ? out.images[0] : "") || "";
    // Ensure quantity is always a number (default 1).
    out.quantity = typeof out.quantity === "number" ? out.quantity : (parseInt(out.quantity, 10) || 1);
    // Ensure isActive defaults to true for old records.
    out.isActive = out.isActive !== false;
    return out;
  }

  function normMenuAdmin(m) {
    if (!m) return m;
    var out = Object.assign({}, m);
    out.desc = out.desc || out.description || "";
    if (m.available === false) out.active = false;
    return out;
  }

  function normGalleryAdmin(g) {
    if (!g) return g;
    var out = Object.assign({}, g);
    out.url = out.url || out.image || "";
    return out;
  }

  function normReviewAdmin(r) {
    if (!r) return r;
    var out = Object.assign({}, r);
    out.text = out.text || r.comment || "";
    // Normalize status enum from DB (PENDING/PUBLISHED/REJECTED) to display (Pending/Published/Rejected)
    if (out.status === "PENDING") out.status = "Pending";
    else if (out.status === "PUBLISHED") out.status = "Published";
    else if (out.status === "REJECTED") out.status = "Rejected";
    else if (out.status === undefined || out.status === null) {
      out.status = r.approved ? "Published" : "Pending";
    }
    return out;
  }

  function normAmenityAdmin(a) { return a; }
  function normSettingAdmin(s) { return s; }

  var ADMIN_NORMALIZERS = {
    rooms:     normRoomAdmin,
    bookings:  normBooking,
    menu:      normMenuAdmin,
    gallery:   normGalleryAdmin,
    reviews:   normReviewAdmin,
    amenities: normAmenityAdmin,
    settings:  normSettingAdmin
  };

  function normAdminItem(col, item) {
    var fn = ADMIN_NORMALIZERS[col];
    return fn ? fn(item) : item;
  }

  function normAdminList(col, items) {
    if (!Array.isArray(items)) return [];
    return items.map(function (it) { return normAdminItem(col, it); });
  }

  /* ===========================================================
     SECTION 6 — Admin CRUD Operations
     =========================================================== */
  function adminList(col) {
    var ep = ADMIN_ENDPOINTS[col];
    if (!ep) return Promise.resolve([]);
    return apiGet(ep).then(guardAuth).then(function (res) {
      if (!res.json || !res.json.ok) return [];
      return normAdminList(col, res.json.data);
    });
  }

  function listRoomTypes() {
    return apiGet("rooms/types").then(function (res) {
      if (!res.json || !res.json.ok) return [];
      return res.json.data || [];
    }).catch(function () { return []; });
  }

  function adminGet(col, id) {
    var ep = ADMIN_ENDPOINTS[col];
    if (!ep) return Promise.resolve(null);
    // Settings use key-based lookup, others use id
    var path = col === "settings" ? ep + "/" + encodeURIComponent(id) : ep + "/" + encodeURIComponent(id);
    return apiGet(path).then(guardAuth).then(function (res) {
      if (!res.json || !res.json.ok) return null;
      return normAdminItem(col, res.json.data);
    });
  }

  function adminCreate(col, data) {
    var ep = ADMIN_ENDPOINTS[col];
    if (!ep) return Promise.resolve(null);
    // Settings use PUT (upsert by key), not POST
    if (col === "settings") {
      var key = data.key || data.id || "info";
      return apiPut(ep + "/" + encodeURIComponent(key), { value: typeof data.value === "string" ? data.value : JSON.stringify(data.value), label: data.label || "" })
        .then(guardAuth).then(function (res) {
          if (!res.json || !res.json.ok) return null;
          return normAdminItem(col, res.json.data);
        });
    }
    // Strip dashboard-only fields before sending to backend
    var payload = stripDashFields(col, data);
    return apiPost(ep, payload).then(guardAuth).then(function (res) {
      if (!res.json || !res.json.ok) return null;
      return normAdminItem(col, res.json.data);
    });
  }

  function adminUpdate(col, id, patch) {
    var ep = ADMIN_ENDPOINTS[col];
    if (!ep) return Promise.resolve(null);
    // Settings use PUT /settings/:key
    if (col === "settings") {
      var key = id;
      return apiPut(ep + "/" + encodeURIComponent(key), { value: typeof patch.value === "string" ? patch.value : JSON.stringify(patch.value), label: patch.label || "" })
        .then(guardAuth).then(function (res) {
          if (!res.json || !res.json.ok) return null;
          return normAdminItem(col, res.json.data);
        });
    }
    // Bookings: convert dashboard enums → backend enums before sending
    var payload = stripDashFields(col, patch);
    if (col === "bookings") payload = normBookingForApi(patch);
    return apiPut(ep + "/" + encodeURIComponent(id), payload).then(guardAuth).then(function (res) {
      if (!res.json || !res.json.ok) {
        var errMsg = (res.json && res.json.error && res.json.error.message) || "Update failed (HTTP " + res.status + ")";
        throw new Error(errMsg);
      }
      return normAdminItem(col, res.json.data);
    });
  }

  function adminDelete(col, id) {
    var ep = ADMIN_ENDPOINTS[col];
    if (!ep) return Promise.resolve();
    var path = ep + "/" + encodeURIComponent(id);
    return apiDelete(path).then(guardAuth).then(function (res) {
      if (!res.json || !res.json.ok) {
        var msg = (res.json && res.json.error && res.json.error.message) || "Delete failed";
        var err = new Error(msg);
        err.code = res.json && res.json.error && res.json.error.code;
        throw err;
      }
      return true;
    });
  }

  /** Upload an image file to the backend (Cloudinary).
   *  Returns { url, publicId } or throws. */
  function uploadImage(file) {
    var url = base() + "/admin/uploads";
    if (!url || url === "/admin/uploads") return Promise.reject(new Error("No API base URL"));
    var fd = new FormData();
    fd.append("image", file);
    var headers = {};
    var tok = getToken();
    if (tok) headers["Authorization"] = "Bearer " + tok;
    return fetch(url, { method: "POST", headers: headers, body: fd })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
          if (res.status === 401) throw new Error("SESSION_EXPIRED");
          if (res.status === 403) throw new Error("ACCESS_DENIED");
          if (res.status === 413) throw new Error("Image must be under 5 MB");
          if (!json || !json.ok) throw new Error((json && json.error && json.error.message) || "Upload failed");
          return json.data;
        });
      });
  }

  /** Strip dashboard-only fields (desc, image, url, text, active, guest, room, revenue, created)
   *  before sending to backend. Backend uses its own field names. */
  function stripDashFields(col, obj) {
    if (!obj) return obj;
    var out = Object.assign({}, obj);
    if (col === "rooms") {
      // Send description (not desc), images array (not image)
      if (out.desc != null && out.description == null) out.description = out.desc;
      delete out.desc;
      if (out.image != null && (!out.images || !out.images.length)) out.images = out.image ? [out.image] : [];
      delete out.image;
    }
    if (col === "menu") {
      if (out.desc != null && out.description == null) out.description = out.desc;
      delete out.desc;
      if (out.active != null && out.available == null) out.available = !!out.active;
      delete out.active;
    }
    if (col === "gallery") {
      if (out.url != null && out.image == null) out.image = out.url;
      delete out.url;
    }
    if (col === "reviews") {
      if (out.text != null && out.comment == null) out.comment = out.text;
      delete out.text;
      // Convert display status to DB enum
      if (out.status != null) {
        var statusMap = { "Pending": "PENDING", "Published": "PUBLISHED", "Rejected": "REJECTED" };
        out.status = statusMap[out.status] || out.status;
      }
    }
    return out;
  }

  /* ===========================================================
     SECTION 7 — Public API (preserved for backward compat)
     =========================================================== */
  var ENDPOINT_MAP = {
    rooms:     "rooms",
    menu:      "menu",
    gallery:   "gallery",
    reviews:   "reviews",
    amenities: "amenities",
    settings:  "settings"
  };

  function fetchJson(url) {
    return fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" }
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function (json) {
      if (json.ok !== true || !Array.isArray(json.data)) {
        throw new Error("Malformed API response");
      }
      return json.data;
    });
  }

  function normRoom(r) {
    return Object.assign({}, r, {
      desc:   r.desc   || r.description || "",
      image:  r.image  || (Array.isArray(r.images) ? r.images[0] : "") || "",
      quantity: typeof r.quantity === "number" ? r.quantity : (parseInt(r.quantity, 10) || 1),
      isActive: r.isActive !== false
    });
  }
  function normMenu(m) {
    var out = Object.assign({}, m, { desc: m.desc || m.description || "" });
    if (m.available === false) out.active = false;
    return out;
  }
  function normGallery(g) { return Object.assign({}, g, { url: g.url || g.image || "" }); }
  function normReview(r) {
    var out = Object.assign({}, r, { text: r.text || r.comment || "" });
    if (out.status === "PUBLISHED") out.status = "Published";
    else if (out.status === "PENDING") out.status = "Pending";
    else if (out.status === "REJECTED") out.status = "Rejected";
    else if (out.status === undefined || out.status === null) out.status = r.approved ? "Published" : "Pending";
    return out;
  }

  var NORMALIZERS = { rooms: normRoom, menu: normMenu, gallery: normGallery, reviews: normReview, amenities: null, settings: null };
  function normalize(collection, items) { var fn = NORMALIZERS[collection]; return fn ? items.map(fn) : items; }

  var ApiClient = {
    // Token management
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,

    // Admin auth
    adminLogin: adminLogin,
    adminLogout: adminLogout,
    adminMe: adminMe,
    adminVerify: adminVerify,

    // Admin CRUD
    adminList: adminList,
    adminGet: adminGet,
    adminCreate: adminCreate,
    adminUpdate: adminUpdate,
    adminDelete: adminDelete,

    // Dashboard stats (revenue from PAID bookings only)
    adminDashboardStats: function () {
      return apiGet("admin/dashboard/stats").then(guardAuth).then(function (res) {
        if (!res.json || !res.json.ok) {
          var errMsg = (res.json && res.json.error && res.json.error.message) || "Stats endpoint failed (HTTP " + res.status + ")";
          console.error("[REVENUE] Stats endpoint error:", errMsg);
          throw new Error(errMsg);
        }
        return res.json.data || { totalRevenue: 0 };
      }).catch(function (e) {
        console.error("[REVENUE] Stats fetch failed:", e.message);
        throw e;
      });
    },

    // Room types (dynamic, derived from DB)
    listRoomTypes: listRoomTypes,

    // Image upload
    uploadImage: uploadImage,

    // Admin normalization helpers (exported for dashboard use)
    normBooking: normBooking,
    normBookingForApi: normBookingForApi,
    normAdminItem: normAdminItem,

    // Public read API (preserved)
    post: function (path, body) {
      if (!base()) return Promise.resolve({ status: 0, json: null });
      return apiPost(path, body);
    },
    // Public review submission
    submitReview: function (data) {
      if (!base()) return Promise.resolve({ status: 0, json: null });
      return apiPost("reviews", data);
    },
    getList: function (collection) {
      var endpoint = ENDPOINT_MAP[collection];
      if (!endpoint) return Promise.resolve(null);
      return fetchJson(base() + "/" + endpoint)
        .then(function (rows) { return normalize(collection, rows); })
        .catch(function (e) { console.warn("[api-client] getList(" + collection + ") failed:", e.message); return null; });
    },
    getDoc: function (collection) {
      var endpoint = ENDPOINT_MAP[collection];
      if (!endpoint) return Promise.resolve(null);
      return fetchJson(base() + "/" + endpoint)
        .then(function (rows) { var arr = normalize(collection, rows); return arr[0] || null; })
        .catch(function (e) { console.warn("[api-client] getDoc(" + collection + ") failed:", e.message); return null; });
    },
    getById: function (collection, id) {
      var endpoint = ENDPOINT_MAP[collection];
      if (!endpoint) return Promise.resolve(null);
      return fetchJson(base() + "/" + endpoint)
        .then(function (rows) {
          var arr = normalize(collection, rows);
          for (var i = 0; i < arr.length; i++) { if (arr[i] && arr[i].id === id) return arr[i]; }
          return null;
        })
        .catch(function (e) { console.warn("[api-client] getById(" + collection + ") failed:", e.message); return null; });
    },
    isLive: function () { return !!base(); }
  };

  window.MGApiClient = ApiClient;
})();
