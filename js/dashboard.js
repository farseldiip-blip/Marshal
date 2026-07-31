/* =========================================================
   dashboard.js — Admin dashboard (full build)
   Sections: Login · Home/Analytics · Rooms · Bookings · Customers
   · Reviews · Gallery · Restaurant (menu) · Amenities · Hotel Info
   · Settings · Logout
   Data layer: REST API (PostgreSQL) via api-client, or a local demo
   store (localStorage) when no backend is configured.
   ========================================================= */
(function () {
  "use strict";

  function showError(msg) {
    let box = document.getElementById("dashError");
    if (!box) {
      box = document.createElement("div");
      box.id = "dashError";
      box.style.cssText = "position:fixed;inset-inline:12px;bottom:12px;z-index:9999;background:#7f1d1d;color:#fff;padding:12px 14px;border-radius:10px;font:12px/1.5 monospace;white-space:pre-wrap;max-height:40vh;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,.4)";
      document.body.appendChild(box);
    }
    box.textContent = tr("Dashboard error:") + "\n" + msg;
  }
  window.addEventListener("error", (e) => showError((e.message || e.error) + (e.filename ? "\n@ " + e.filename + ":" + e.lineno : "")));
  window.addEventListener("unhandledrejection", (e) => showError(tr("Promise:") + " " + (e.reason && e.reason.message ? e.reason.message : e.reason)));

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const DEMO_KEY = "mg-demo-db";
  const seed = window.__mgSeed;

  function loadDemo() {
    let d = localStorage.getItem(DEMO_KEY);
    if (!d) { d = seed(); localStorage.setItem(DEMO_KEY, JSON.stringify(d)); }
    else d = JSON.parse(d);
    return d;
  }
  function saveDemo(db) { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); }

  const Demo = {
    async list(col) { const db = loadDemo(); return [...(db[col] || [])]; },
    async add(col, item) { const db = loadDemo(); item.id = item.id || (col[0] + Date.now()); (db[col] = db[col] || []).push(item); saveDemo(db); return item; },
    async update(col, id, patch) { const db = loadDemo(); const i = (db[col] || []).findIndex(x => x.id === id); if (i > -1) { db[col][i] = { ...db[col][i], ...patch }; saveDemo(db); } },
    async remove(col, id) { const db = loadDemo(); db[col] = (db[col] || []).filter(x => x.id !== id); saveDemo(db); },
    async set(col, obj) { const db = loadDemo(); db[col] = obj; saveDemo(db); },
    async getDoc(col) { const db = loadDemo(); return db[col]; }
  };

  async function ready() {
    if (window.MGApiClient && window.MGApiClient.isLive() && window.MGApiClient.getToken()) return "rest";
    return "demo";
  }

  const Data = {
    mode: "demo",
    async list(col) {
      if (this.mode === "rest" && window.MGApiClient) {
        return window.MGApiClient.adminList(col);
      }
      return Demo.list(col);
    },
    async add(col, item) {
      if (this.mode === "rest" && window.MGApiClient) {
        return window.MGApiClient.adminCreate(col, item);
      }
      return Demo.add(col, item);
    },
    async update(col, id, patch) {
      if (this.mode === "rest" && window.MGApiClient) {
        return window.MGApiClient.adminUpdate(col, id, patch);
      }
      return Demo.update(col, id, patch);
    },
    async remove(col, id) {
      if (this.mode === "rest" && window.MGApiClient) {
        return window.MGApiClient.adminDelete(col, id);
      }
      return Demo.remove(col, id);
    },
    async set(col, obj) {
      if (this.mode === "rest" && window.MGApiClient) {
        if (col === "settings") {
          for (const [k, v] of Object.entries(obj)) {
            await window.MGApiClient.adminCreate("settings", { key: k, value: String(v), label: k });
          }
          return;
        }
        if (col === "hotel") {
          await window.MGApiClient.adminCreate("settings", { key: "hotel_info", value: JSON.stringify(obj), label: "Hotel Information" });
          if (obj.name != null) await window.MGApiClient.adminCreate("settings", { key: "hotelName", value: String(obj.name), label: "Hotel Name" });
          if (obj.email != null) await window.MGApiClient.adminCreate("settings", { key: "contactEmail", value: String(obj.email), label: "Contact Email" });
          if (obj.phone != null) await window.MGApiClient.adminCreate("settings", { key: "contactPhone", value: String(obj.phone), label: "Contact Phone" });
          if (obj.address != null) await window.MGApiClient.adminCreate("settings", { key: "address", value: String(obj.address), label: "Address" });
          return;
        }
        return;
      }
      return Demo.set(col, obj);
    },
    async getDoc(col) {
      if (this.mode === "rest" && window.MGApiClient) {
        if (col === "settings") {
          const items = await window.MGApiClient.adminList("settings");
          const obj = {};
          (items || []).forEach(s => { obj[s.key] = s.value; });
          return obj;
        }
        if (col === "hotel") {
          const items = await window.MGApiClient.adminList("settings");
          const map = {};
          (items || []).forEach(s => { map[s.key] = s.value; });
          const fromKeys = {
            name:    map.hotelName || "",
            email:   map.contactEmail || "",
            phone:   map.contactPhone || "",
            address: map.address || "",
            tagline: map.hotel_tagline || "",
            about:   map.hotel_about || ""
          };
          const found = (items || []).find(s => s.key === "hotel_info");
          if (found && found.value) {
            try {
              const hi = JSON.parse(found.value);
              Object.keys(fromKeys).forEach(k => {
                if (!fromKeys[k] && hi[k]) fromKeys[k] = hi[k];
              });
            } catch (e) { /* ignore */ }
          }
          return fromKeys;
        }
        return null;
      }
      return Demo.getDoc(col);
    },
    async uploadImage(file, path) {
      if (this.mode === "rest" && window.MGApiClient && window.MGApiClient.uploadImage) {
        return await window.MGApiClient.uploadImage(file);
      }
      return null;
    }
  };

  /* ---------------- Helpers ---------------- */
  function el(tag, attrs = {}, html = "") {
    const n = document.createElement(tag);
    for (const k in attrs) { if (k === "class") n.className = attrs[k]; else n.setAttribute(k, attrs[k]); }
    if (html) n.innerHTML = html;
    return n;
  }

  function toast(msg, type) {
    const icons = { ok: "&#10003;", err: "&#10007;", info: "&#9432;" };
    const cls = type === "err" ? "error" : type === "info" ? "info" : "";
    let t = $("#toast");
    if (!t) { t = el("div", { id: "toast" }); document.body.appendChild(t); }
    t.innerHTML = `<span class="toast__icon">${icons[type] || icons.ok}</span><span>${msg}</span>`;
    t.className = "toast show " + cls;
    clearTimeout(t._t);
    t._t = setTimeout(() => t.className = "toast", 2600);
  }

  var esc = (window.MGShared && MGShared.esc) || function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  };
  var money = (window.MGShared && MGShared.money) || function (n) {
    if (window.MGSettings && MGSettings.formatMoney) return MGSettings.formatMoney(n);
    if (n == null || n === "") return "\u2014";
    var v = Number(n);
    if (isNaN(v) || !isFinite(v)) return "\u2014";
    var code = (window.MGSettings && MGSettings.getCurrency) ? MGSettings.getCurrency() : "USD";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code, currencyDisplay: "symbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  };
  function moneyCode(n) {
    if (window.MGSettings && MGSettings.formatMoneyCode) return MGSettings.formatMoneyCode(n);
    var formatted = money(n);
    if (formatted === "\u2014") return formatted;
    var code = (window.MGSettings && MGSettings.getCurrency) ? MGSettings.getCurrency() : "USD";
    if (formatted.indexOf(code) !== -1) return formatted;
    return formatted + " " + code;
  }
  function moneyRefund(n) {
    return "-" + money(n);
  }
  function timeAgo(dateStr) {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return tr("just now");
    if (mins < 60) return mins + tr("m ago");
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + tr("h ago");
    const days = Math.floor(hrs / 24);
    return days + tr("d ago");
  }

  function emptyState(icon, title, sub, actionHtml) {
    return `<div class="dash-empty">
      <div class="dash-empty__icon">${icon}</div>
      <div class="dash-empty__title">${title}</div>
      <div class="dash-empty__sub">${sub}</div>
      ${actionHtml ? `<div class="dash-empty__action">${actionHtml}</div>` : ""}
    </div>`;
  }

  /* ---------------- Dashboard i18n (EN/AR) ---------------- */
  const DI18N = {
    en: {},
    ar: {
      "Dashboard": "لوحة التحكم", "Rooms": "الغرف", "Bookings": "الحجوزات", "Customers": "العملاء",
      "Reviews": "التقييمات", "Gallery": "المعرض", "Restaurant": "المطعم", "Amenities": "المرافق",
      "Hotel Info": "معلومات الفندق", "Settings": "الإعدادات", "Logout": "تسجيل الخروج",
      "Admin Console": "وحدة التحكم", "Sign In": "تسجيل الدخول", "Email": "البريد الإلكتروني",
      "Password": "كلمة المرور", "Loading…": "جارٍ التحميل…", "Add": "إضافة", "Edit": "تعديل",
      "Delete": "حذف", "Save": "حفظ", "Cancel": "إلغاء", "Mode": "الوضع", "demo": "تجريبي",
      "No records": "لا توجد سجلات", "No bookings": "لا توجد حجوزات",
      "Recent Bookings": "أحدث الحجوزات", "Revenue Trend": "اتجاه الإيرادات", "Booking Status": "حالة الحجوزات",
      "Confirmed": "مؤكد", "Pending": "قيد الانتظار", "Cancelled": "ملغى", "Published": "منشور", "Hidden": "مخفي",
      "Rooms": "الغرف", "Bookings": "الحجوزات", "Customers": "العملاء", "Reviews": "التقييمات",
      "Guest": "النزيل", "Room": "الغرفة", "Check-in": "الوصول", "Check-out": "المغادرة", "Guests": "النزلاء",
      "Revenue": "الإيراد", "Status": "الحالة", "Name": "الاسم", "Type": "النوع", "Price / night": "السعر / ليلة",
      "Size": "المساحة", "Description": "الوصف", "Amenities (comma)": "المرافق (بفاصلة)", "Image": "صورة",
      "Featured": "مميز", "Phone": "الهاتف", "Country": "الدولة", "Visits": "الزيارات",
      "Rating (1-5)": "التقييم (1-5)", "Review": "التقييم", "Title": "العنوان", "Category": "الفئة",
      "Price": "السعر", "Hotel Information": "معلومات الفندق", "Tagline": "الشعار", "Address": "العنوان",
      "About": "نبذة", "Settings": "الإعدادات", "Default Theme": "السمة الافتراضية",
      "Currency": "العملة", "Default Language": "اللغة الافتراضية",
      "Mode:": "الوضع:",
      "Delete this record?": "حذف هذا السجل؟", "Updated": "تم التحديث", "Added": "تمت الإضافة",
      "Hotel info saved": "تم حفظ معلومات الفندق", "Settings saved": "تم حفظ الإعدادات", "Deleted": "تم الحذف",
      "Add Room": "إضافة غرفة", "Add Booking": "إضافة حجز", "Add Customer": "إضافة عميل",
      "Add Review": "إضافة تقييم", "Add Gallery": "إضافة صورة", "Add Menu": "إضافة عنصر",
      "Add Amenity": "إضافة مرفق",
      "Login failed:": "فشل الدخول:", "Dashboard reset": "تمت إعادة تعيين لوحة التحكم", "Reset failed": "فشلت إعادة التعيين",
      "Bookings Management": "إدارة الحجوزات", "Search bookings…": "بحث في الحجوزات…",
      "All Statuses": "كل الحالات", "All Payments": "كل المدفوعات",
      "Check-in from": "الوصول من", "Check-out to": "المغادرة إلى",
      "Reference": "المرجع", "Guest": "النزيل", "Room": "الغرفة",
      "Total": "الإجمالي", "Payment": "الدفع", "Actions": "الإجراءات",
      "View": "عرض", "Confirm": "تأكيد", "Cancel Booking": "إلغاء الحجز",
      "Check In": "تسجيل الدخول", "Check Out": "تسجيل الخروج",
      "Booking Details": "تفاصيل الحجز", "No bookings found": "لا توجد حجوزات",
      "Loading bookings…": "جارٍ تحميل الحجوزات…",
      "Could not load bookings": "تعذّر تحميل الحجوزات",
      "Not authorized": "غير مصرح", "Admin claim required": "يتطلب صلاحية المدير",
      "Booked updated": "تم تحديث الحجز", "Already": "بالفعل",
      "Checked In": "سجّل دخوله", "Checked Out": "سجّل خروجه", "Unpaid": "غير مدفوع",
      "Paid": "مدفوع", "Pending": "قيد الانتظار", "Failed": "فشل", "Refunded": "مُسترد",
      "Cancelled": "ملغى", "Email": "البريد", "Phone": "الهاتف", "Adults": "بالغون",
      "Children": "أطفال", "Rooms": "غرف", "Nights": "ليالٍ", "Created": "أُنشئ",
      "Mark Pending": "تحديد قيد الانتظار", "Mark Paid": "تحديد مدفوع",
      "Mark Failed": "تحديد فشل", "Mark Refunded": "تحديد مُسترد", "Payment:": "الدفع:",
      "Reviews Management": "إدارة التقييمات", "Filter by status": "تصفية حسب الحالة",
      "All": "الكل", "Rejected": "مرفوض", "Publish": "نشر", "Reject": "رفض",
      "Delete this review?": "حذف هذا التقييم؟", "Review updated": "تم تحديث التقييم",
      "Could not load reviews": "تعذّر تحميل التقييمات", "Loading reviews…": "جارٍ تحميل التقييمات…",
      "No reviews found": "لا توجد تقييمات", "reviews": "تقييمات",
      "Rating": "التقييم", "Author": "المؤلف",
      "Today's Arrivals": "وصولات اليوم", "Today's Departures": "مغادرات اليوم",
      "Pending Reviews": "تقييمات معلّقة", "Active Rooms": "غرف نشطة",
      "Total Revenue": "إجمالي الإيراد",       "No notifications": "لا إشعارات",
      "Mark all read": "تحديد الكل كمقروء", "Notifications": "الإشعارات",
      "just now": "الآن", "m ago": "د مضت", "h ago": "س مضت", "d ago": "ي مضت",
      "new": "جديد", "pending": "معلّق",
      "Guest": "النزيل", "{guest} submitted a review": "{guest} أرسل تقييمًا",
      "{guest} has a pending booking": "{guest} لديه حجز قيد الانتظار",
      "{guest} has unpaid booking": "{guest} لديه حجز غير مدفوع",
      "Booking updated": "تم تحديث الحجز", "Error": "خطأ",
      "Occupancy": "نسبة الإشغال", "Active": "نشط", "Archived": "مؤرشف", "Archive": "أرشفة",
      "Restore": "استعادة", "Qty": "الكمية", "Room Name": "اسم الغرفة", "Room Type": "نوع الغرفة",
      "Number of Rooms": "عدد الغرف", "Type or select…": "اكتب أو اختر…",
      "Connected to PostgreSQL backend via REST API.": "متصل بقاعدة البيانات عبر واجهة REST.",
      "Running in demo mode.": "يعمل في الوضع التجريبي.",
      " (no keys)": " (بدون مفاتيح)",
      "Select an image (JPEG, PNG, WebP, max 5 MB).": "اختر صورة (JPEG, PNG, WebP, حد أقصى 5 ميجا).",
      "Select an image file.": "اختر ملف صورة.",
      "Check In": "تسجيل الوصول", "Check Out": "تسجيل المغادرة",
      "Menu": "القائمة",
      "Apr": "أبريل", "May": "مايو", "Jun": "يونيو", "Jul": "يوليو", "Aug": "أغسطس", "Sep": "سبتمبر",
      "Not authorized — admin access required.": "غير مصرح — يتطلب صلاحية المدير.",
      "Credentials required": "البيانات مطلوبة",
      "Reset": "إعادة تعيين", "Login failed": "فشل تسجيل الدخول",
      "Room archived successfully": "تم أرشفة الغرفة", "Room restored successfully": "تمت استعادة الغرفة",
      "Archive failed:": "فشلت الأرشفة:", "Restore failed:": "فشلت الاستعادة:",
      "Cannot delete: ": "لا يمكن الحذف: ",
      "Name and Type are required": "الاسم والنوع مطلوبان",
      "Uploading image…": "جارٍ رفع الصورة…", "Image uploaded.": "تم رفع الصورة.",
      "Upload failed:": "فشل الرفع:",
      "Delete": "حذف", "Delete this record?": "حذف هذا السجل؟",
      "Dashboard error:": "خطأ في لوحة التحكم:",
      "Promise:": "خطأ في الوعد:"
    }
  };
  function tr(str, params) {
    const l = (window.MGLang && window.MGLang.get && window.MGLang.get()) || "en";
    let out = (l === "ar" && DI18N.ar[str] != null) ? DI18N.ar[str] : str;
    if (params && typeof out === "string") {
      Object.keys(params).forEach(k => { out = out.split("{" + k + "}").join(params[k]); });
    }
    return out;
  }
  function localizeView(view) {
    const l = (window.MGLang && window.MGLang.get && window.MGLang.get()) || "en";
    if (l !== "ar") return;
    view.querySelectorAll("h1,h3,th,button,.dash-stat__label,.dash-login__sub,.dash-note").forEach(n => {
      const key = n.textContent.trim();
      if (DI18N.ar[key] != null) n.textContent = DI18N.ar[key];
    });
  }

  /* ---------------- Auth ---------------- */
  async function assertAdmin() {
    if (window.MGApiClient && window.MGApiClient.getToken()) {
      const user = await window.MGApiClient.adminVerify();
      return user;
    }
    throw new Error("not_authed");
  }

  function redirectToAccount() {
    localStorage.removeItem("mg-admin-jwt");
    localStorage.removeItem("mg-user-jwt");
    sessionStorage.removeItem("mg-auth");
    window.location.replace("pages/account.html");
  }

  /* ---------------- Sections registry ---------------- */
  let currentSection = "home";
  let adminOk = false;
  let bkCloseMenus = null;
  document.addEventListener("click", (e) => {
    if (bkCloseMenus && !e.target.closest(".bk-mpos")) bkCloseMenus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && bkCloseMenus) bkCloseMenus();
  });
  const SECTIONS = [
    { id: "home", label: "Dashboard", icon: "▦", i18n: "d_dashboard" },
    { id: "rooms", label: "Rooms", icon: "🛏", i18n: "d_rooms" },
    { id: "bookings", label: "Bookings", icon: "📅", i18n: "d_bookings" },
    { id: "customers", label: "Customers", icon: "👤", i18n: "d_customers" },
    { id: "reviews", label: "Reviews", icon: "★", i18n: "d_reviews" },
    { id: "gallery", label: "Gallery", icon: "▣", i18n: "d_gallery" },
    { id: "menu", label: "Restaurant", icon: "🍽", i18n: "d_menu" },
    { id: "amenities", label: "Amenities", icon: "✦", i18n: "d_amenities" },
    { id: "hotel", label: "Hotel Info", icon: "⚑", i18n: "d_hotel" },
    { id: "settings", label: "Settings", icon: "⚙", i18n: "d_settings" }
  ];

  /* ---------------- Notification System ---------------- */
  let _notifData = { pendingReviews: 0, pendingBookings: 0, unpaidBookings: 0, items: [] };

  async function refreshNotifications() {
    try {
      const [reviews, bookings] = await Promise.all([
        Data.list("reviews"),
        Data.list("bookings")
      ]);
      const pendingReviews = reviews.filter(r => r.status === "Pending").length;
      const pendingBookings = bookings.filter(b => b.status === "Pending").length;
      const unpaidBookings = bookings.filter(b => (b.paymentStatus || "Unpaid") === "Unpaid").length;
      const total = pendingReviews + pendingBookings;

      const items = [];
      if (pendingReviews > 0) {
        reviews.filter(r => r.status === "Pending").slice(0, 3).forEach(r => {
          const guest = esc(r.author || "Guest");
          items.push({ type: "review", icon: "★", text: tr("{guest} submitted a review", { guest: `<strong>${guest}</strong>` }), time: r.createdAt });
        });
      }
      if (pendingBookings > 0) {
        bookings.filter(b => b.status === "Pending").slice(0, 3).forEach(b => {
          const guest = esc(b.guestName || b.guest || "Guest");
          items.push({ type: "booking", icon: "📅", text: tr("{guest} has a pending booking", { guest: `<strong>${guest}</strong>` }), time: b.created });
        });
      }
      if (unpaidBookings > 0) {
        bookings.filter(b => (b.paymentStatus || "Unpaid") === "Unpaid" && b.status !== "Cancelled").slice(0, 2).forEach(b => {
          const guest = esc(b.guestName || b.guest || "Guest");
          items.push({ type: "payment", icon: "💳", text: tr("{guest} has unpaid booking", { guest: `<strong>${guest}</strong>` }), time: b.created });
        });
      }

      _notifData = { pendingReviews, pendingBookings, unpaidBookings, items: items.slice(0, 8) };
      _notifData.total = pendingReviews + pendingBookings;
    } catch (e) {
      _notifData = { pendingReviews: 0, pendingBookings: 0, unpaidBookings: 0, items: [], total: 0 };
    }
    updateNotifBadge();
    updateSidebarBadges();
  }

  function updateNotifBadge() {
    const badge = $("#notifBadge");
    if (!badge) return;
    const count = _notifData.total || 0;
    badge.textContent = count > 99 ? "99+" : count;
    badge.style.display = count > 0 ? "flex" : "none";
    if (count > 0) {
      badge.classList.remove("pulse");
      void badge.offsetWidth;
      badge.classList.add("pulse");
    }
  }

  function renderNotifPanel() {
    const panel = $("#notifPanel");
    if (!panel) return;
    const items = _notifData.items || [];
    if (!items.length) {
      panel.innerHTML = `<div class="dash-notif-panel__head">
        <h4>${tr("Notifications")}</h4>
      </div><div class="dash-notif-empty">${tr("No notifications")}</div>`;
      return;
    }
    panel.innerHTML = `<div class="dash-notif-panel__head">
      <h4>${tr("Notifications")}</h4>
      <button id="notifMarkRead">${tr("Mark all read")}</button>
    </div>
    <div class="dash-notif-panel__list">
      ${items.map(n => `
        <div class="dash-notif-item" data-notif-type="${n.type}">
          <div class="dash-notif-item__icon ${n.type}">${n.icon}</div>
          <div class="dash-notif-item__body">
            <div class="dash-notif-item__text">${n.text}</div>
            <div class="dash-notif-item__time">${timeAgo(n.time)}</div>
          </div>
        </div>
      `).join("")}
    </div>`;

    panel.querySelectorAll(".dash-notif-item").forEach(item => {
      item.addEventListener("click", () => {
        const type = item.dataset.notifType;
        if (type === "review") showSection("reviews");
        else if (type === "booking" || type === "payment") showSection("bookings");
        closeNotifPanel();
      });
    });

    const markBtn = $("#notifMarkRead", panel);
    if (markBtn) markBtn.addEventListener("click", () => {
      _notifData = { ..._notifData, total: 0, items: [] };
      updateNotifBadge();
      renderNotifPanel();
    });
  }

  function closeNotifPanel() {
    const panel = $("#notifPanel");
    if (panel) panel.classList.remove("open");
  }

  function updateSidebarBadges() {
    SECTIONS.forEach(s => {
      const link = $(`.dash-link[data-section="${s.id}"]`);
      if (!link) return;
      let existing = link.querySelector(".dash-link__badge");
      let count = 0;

      if (s.id === "reviews") count = _notifData.pendingReviews || 0;
      else if (s.id === "bookings") count = _notifData.pendingBookings || 0;

      if (count > 0) {
        if (!existing) {
          existing = el("span", { class: "dash-link__badge" });
          link.appendChild(existing);
        }
        existing.textContent = count > 99 ? "99+" : count;
      } else if (existing) {
        existing.remove();
      }
    });
  }

  /* ---------------- Shell ---------------- */
  function buildShell() {
    const app = $("#dash");
    app.className = "dash";
    app.innerHTML = `
      <aside class="dash-side" id="dashSide">
        <div class="dash-brand"><span>Marshal</span><span>Al-Gezira</span></div>
        <nav class="dash-nav">
          ${SECTIONS.map(s => `<button class="dash-link" data-section="${s.id}"><span>${s.icon}</span><span data-i18n="${s.i18n}">${s.label}</span></button>`).join("")}
        </nav>
        <button class="dash-link dash-logout" id="dashLogout"><span>⏻</span><span data-i18n="d_logout">Logout</span></button>
        <button class="dash-toggle" id="dashToggle" title="${tr("Toggle sidebar")}"><span>◀</span><span data-i18n="d_collapse">Collapse</span></button>
      </aside>
      <div class="dash-scrim" id="dashScrim"></div>
      <main class="dash-main">
        <header class="dash-top">
          <button class="dash-menu-btn" id="dashMenuBtn" aria-label="Menu">&#9776;</button>
          <h1 id="dashTitle">Dashboard</h1>
          <div class="dash-user">
            <div class="dash-notif" id="dashNotifBtn" title="${tr("Notifications")}">
              🔔
              <span class="dash-notif__badge" id="notifBadge" style="display:none">0</span>
              <div class="dash-notif-panel" id="notifPanel"></div>
            </div>
            <button class="dash-reset" id="dashResetBtn" title="${tr("Reset")}">↺</button>
            <button class="dash-lang" id="dashLangToggle">ع / EN</button>
            <button class="dash-theme" id="dashThemeToggle" title="${tr("Toggle theme")}">☀️</button>
            <span id="dashMode" class="dash-pill">demo</span>
            <span id="dashEmail">admin</span>
          </div>
        </header>
        <nav class="dash-breadcrumbs" id="dashBreadcrumbs" aria-label="Breadcrumb"><span data-i18n="d_dashboard">Dashboard</span></nav>
        <div id="dashView" class="dash-view"></div>
      </main>`;

    $$(".dash-link[data-section]").forEach(b => b.addEventListener("click", () => { showSection(b.dataset.section); closeSidebar(); }));
    $("#dashLogout").addEventListener("click", logout);

    const lt = $("#dashLangToggle");
    if (lt && window.MGLang) lt.addEventListener("click", () => {
      const next = window.MGLang.get() === "ar" ? "en" : "ar";
      window.MGLang.apply(next);
      if (Data.mode === "rest" && window.MGApiClient) {
        window.MGApiClient.adminCreate("settings", { key: "lang", value: next, label: "Default Language" }).catch(() => {});
      }
    });

    const tt = $("#dashThemeToggle");
    if (tt) {
      function syncThemeIcon() {
        var t = localStorage.getItem("mg-theme") || document.documentElement.getAttribute("data-theme") || "dark";
        tt.textContent = t === "dark" ? "☀️" : "🌙";
      }
      syncThemeIcon();
      var themeObs = new MutationObserver(syncThemeIcon);
      themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      tt.addEventListener("click", function () {
        var root = document.documentElement;
        var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        localStorage.setItem("mg-theme", next);
      });
    }

    const mb = $("#dashMenuBtn"), scrim = $("#dashScrim");
    if (mb) mb.addEventListener("click", () => { $("#dashSide").classList.toggle("open"); if (scrim) scrim.classList.toggle("show", $("#dashSide").classList.contains("open")); });
    if (scrim) scrim.addEventListener("click", closeSidebar);

    const toggle = $("#dashToggle");
    if (toggle) toggle.addEventListener("click", () => {
      const db = $("#dash");
      if (!db) return;
      db.classList.toggle("collapsed");
      try { localStorage.setItem("dash-collapsed", db.classList.contains("collapsed") ? "1" : "0"); } catch (e) {}
    });
    try { if (localStorage.getItem("dash-collapsed") === "1") { const db = $("#dash"); if (db) db.classList.add("collapsed"); } } catch (e) {}

    const rb = $("#dashResetBtn");
    if (rb) rb.addEventListener("click", resetDashboard);

    // Notification bell
    const notifBtn = $("#dashNotifBtn");
    if (notifBtn) {
      notifBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const panel = $("#notifPanel");
        if (!panel) return;
        const isOpen = panel.classList.contains("open");
        if (!isOpen) renderNotifPanel();
        panel.classList.toggle("open", !isOpen);
      });
    }
    document.addEventListener("click", (e) => {
      const panel = $("#notifPanel");
      const btn = $("#dashNotifBtn");
      if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
        panel.classList.remove("open");
      }
    });

    if (window.MGLang) window.MGLang.retranslate();
  }

  function closeSidebar() { const s = $("#dashSide"); if (s) s.classList.remove("open"); const sc = $("#dashScrim"); if (sc) sc.classList.remove("show"); }

  function resetDashboard() {
    try {
      $$(".dash-modal:not([hidden])").forEach(m => { m.hidden = true; });
      $$("input[type='search'], input[placeholder*='Search'], input[placeholder*='search']").forEach(inp => { inp.value = ""; });
      const rf = $("#roomFilter"); if (rf) rf.value = "all";
      const bkSearch = $("#bkSearchInput"); if (bkSearch) bkSearch.value = "";
      const bkStatus = $("#bkStatusFilter"); if (bkStatus) bkStatus.value = "all";
      const bkPay = $("#bkPayFilter"); if (bkPay) bkPay.value = "all";
      const bkCin = $("#bkCinFrom"); if (bkCin) bkCin.value = "";
      const bkCout = $("#bkCoutTo"); if (bkCout) bkCout.value = "";
      showSection("home");
      toast(tr("Dashboard reset"));
    } catch (e) {
      toast(tr("Reset failed"), "err");
    }
  }

  async function showSection(id) {
    $$(".dash-link[data-section]").forEach(b => b.classList.toggle("active", b.dataset.section === id));
    const view = $("#dashView");
    const titles = Object.fromEntries(SECTIONS.map(s => [s.id, s.label]));
    const label = tr(titles[id] || "Dashboard");
    if ($("#dashTitle")) $("#dashTitle").textContent = label;
    const bc = $("#dashBreadcrumbs");
    if (bc) {
      if (id === "home") {
        bc.innerHTML = `<span>${label}</span>`;
      } else {
        bc.innerHTML = `<span data-i18n="d_dashboard">${tr("Dashboard")}</span><span class="bc-sep">›</span><span>${label}</span>`;
      }
    }
    view.innerHTML = `<div class="dash-loading">${tr("Loading…")}</div>`;
    if (id === "home") return renderHome(view);
    if (id === "rooms") return renderRooms(view);
    if (id === "bookings") return renderBookings(view);
    if (id === "customers") return renderCrud(view, "customers", {
      cols: ["name", "email", "phone", "country", "visits"],
      fields: [
        { k: "name", label: "Name", type: "text" },
        { k: "email", label: "Email", type: "text" },
        { k: "phone", label: "Phone", type: "text" },
        { k: "country", label: "Country", type: "text" },
        { k: "visits", label: "Visits", type: "number" }
      ]
    });
    if (id === "reviews") return renderReviews(view);
    if (id === "gallery") return renderCrud(view, "gallery", {
      cols: ["title", "url"], media: true,
      fields: [
        { k: "title", label: "Title", type: "text" },
        { k: "url", label: "Image", type: "image" }
      ]
    });
    if (id === "menu") return renderCrud(view, "menu", {
      cols: ["name", "category", "price", "desc"],
      fields: [
        { k: "name", label: "Name", type: "text" },
        { k: "category", label: "Category", type: "text" },
        { k: "price", label: "Price", type: "text" },
        { k: "desc", label: "Description", type: "textarea" },
        { k: "image", label: "Image", type: "image" }
      ]
    });
    if (id === "amenities") return renderCrud(view, "amenities", {
      cols: ["name", "desc"],
      fields: [
        { k: "name", label: "Name", type: "text" },
        { k: "desc", label: "Description", type: "textarea" }
      ]
    });
    if (id === "hotel") return renderHotel(view);
    if (id === "settings") return renderSettings(view);
    localizeView(view);
    currentSection = id;
  }

  /* ---------------- Analytics / Home ---------------- */
  async function renderHome(view) {
    const [rooms, bookings, customers, reviews] = await Promise.all([
      Data.list("rooms"), Data.list("bookings"), Data.list("customers"), Data.list("reviews")
    ]);

    // Revenue: only from bookings with paymentStatus representing a successful payment.
    // The canonical DB value is "PAID" (Prisma PaymentStatus enum).
    // After api-client normalization it becomes "Paid" (Title Case).
    // Use case-insensitive comparison so demo data with any casing is handled.
    function isPaid(b) { return String(b.paymentStatus || "").toUpperCase() === "PAID"; }

    let totalRev;
    if (Data.mode === "rest" && window.MGApiClient && window.MGApiClient.adminDashboardStats) {
      try {
        const stats = await window.MGApiClient.adminDashboardStats();
        totalRev = Number(stats.totalRevenue) || 0;
      } catch (e) {
        console.error("[REVENUE] Backend stats FAILED:", e.message, "— falling back to client-side filter");
        totalRev = bookings.filter(isPaid).reduce((s, b) => s + (Number(b.total || b.revenue) || 0), 0);
      }
    } else {
      totalRev = bookings.filter(isPaid).reduce((s, b) => s + (Number(b.total || b.revenue) || 0), 0);
    }

    const confirmed = bookings.filter(b => b.status === "Confirmed").length;
    const pending = bookings.filter(b => b.status === "Pending").length;
    const checkedIn = bookings.filter(b => b.status === "Checked In").length;
    const activeRooms = rooms.filter(r => r.isActive !== false).length;
    const pendingReviews = reviews.filter(r => r.status === "Pending").length;
    const occupancy = activeRooms ? Math.round((confirmed / activeRooms) * 100) : 0;

    const statusCounts = { Confirmed: confirmed, Pending: pending, Cancelled: bookings.filter(b => b.status === "Cancelled").length };
    const donut = donutSVG(statusCounts);

    const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"].map(m => tr(m));
    const trend = months.map((_, i) => Math.round(totalRev / 6 * (0.7 + 0.12 * i)));
    const line = lineSVG(trend, months);

    view.innerHTML = `
      <div class="dash-cards">
        <div class="dash-stat clickable" data-nav="bookings">
          <div class="dash-stat__head">
            <div class="dash-stat__icon blue">📅</div>
            ${pending > 0 ? `<span class="dash-stat__trend up">${pending} ${tr("new")}</span>` : ""}
          </div>
          <div class="dash-stat__num">${bookings.length}</div>
          <div class="dash-stat__label">${tr("Bookings")}</div>
          <div class="dash-stat__sub">${checkedIn} ${tr("Checked In").toLowerCase()}</div>
        </div>
        <div class="dash-stat clickable" data-nav="rooms">
          <div class="dash-stat__head">
            <div class="dash-stat__icon gold">🛏</div>
            <span class="dash-stat__trend ${occupancy > 70 ? 'up' : ''}">${occupancy}%</span>
          </div>
          <div class="dash-stat__num">${activeRooms}</div>
          <div class="dash-stat__label">${tr("Active Rooms")}</div>
          <div class="dash-stat__sub">${tr("Occupancy")}: ${occupancy}%</div>
        </div>
        <div class="dash-stat clickable" data-nav="reviews">
          <div class="dash-stat__head">
            <div class="dash-stat__icon warn">★</div>
            ${pendingReviews > 0 ? `<span class="dash-stat__trend up">${pendingReviews} ${tr("pending")}</span>` : ""}
          </div>
          <div class="dash-stat__num">${reviews.length}</div>
          <div class="dash-stat__label">${tr("Reviews")}</div>
          <div class="dash-stat__sub">${pendingReviews} ${tr("Pending").toLowerCase()}</div>
        </div>
        <div class="dash-stat">
          <div class="dash-stat__head">
            <div class="dash-stat__icon green">💰</div>
          </div>
          <div class="dash-stat__num">${moneyCode(totalRev)}</div>
          <div class="dash-stat__label">${tr("Total Revenue")}</div>
          <div class="dash-stat__sub">${customers.length} ${tr("Customers").toLowerCase()}</div>
        </div>
      </div>

      <div class="dash-grid-2">
        <div class="dash-panel">
          <h3>${tr("Revenue Trend")}</h3>
          ${line}
        </div>
        <div class="dash-panel">
          <h3>${tr("Booking Status")}</h3>
          <div class="dash-donut">${donut}<div class="dash-donut__legend">
            <span><i style="background:#22c55e"></i>${tr("Confirmed")} ${confirmed}</span>
            <span><i style="background:#eab308"></i>${tr("Pending")} ${pending}</span>
            <span><i style="background:#ef4444"></i>${tr("Cancelled")} ${statusCounts.Cancelled}</span>
          </div></div>
        </div>
      </div>

      <div class="dash-panel">
        <div class="dash-panel__head">
          <h3>${tr("Recent Bookings")}</h3>
        </div>
        ${bookings.length ? `<div class="table-wrap">
          <table class="dash-table">
            <thead><tr><th>${tr("Guest")}</th><th>${tr("Room")}</th><th>${tr("Check-in")}</th><th>${tr("Total")}</th><th>${tr("Status")}</th></tr></thead>
            <tbody>
              ${bookings.slice(0, 6).map(b => {
                const isAttention = b.status === "Pending";
                const totalVal = b.total != null ? b.total : b.revenue;
                const paymentStatus = b.paymentStatus || "Unpaid";
                const payColor = paymentStatus === "Paid" ? "var(--dash-success)" : paymentStatus === "Refunded" ? "var(--dash-info)" : paymentStatus === "Failed" ? "var(--dash-danger)" : "var(--dash-warning)";
                return `<tr ${isAttention ? 'data-attention="true"' : ""}>
                  <td data-label="${tr("Guest")}"><div class="dash-cell-guest"><span class="dash-cell-guest__name">${esc(b.guestName || b.guest || "")}</span></div></td>
                  <td data-label="${tr("Room")}">${esc(b.roomName || b.room || "")}</td>
                  <td data-label="${tr("Check-in")}">${esc(b.checkin || "")}</td>
                  <td data-label="${tr("Total")}"><div class="dash-cell-guest"><span class="dash-cell-guest__name">${money(totalVal)}</span><span class="dash-cell-guest__sub">${tr("Total")} · ${esc(paymentStatus)}</span></div></td>
                  <td data-label="${tr("Status")}">${statusTag(b.status || "Pending")}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>` : emptyState("📅", tr("No bookings"), tr("No bookings found"))}
      </div>`;

    // KPI cards navigation
    view.querySelectorAll("[data-nav]").forEach(card => {
      card.addEventListener("click", () => showSection(card.dataset.nav));
    });

    refreshNotifications();
  }

  function statCard(label, val) {
    return `<div class="dash-stat"><div class="dash-stat__num">${val}</div><div class="dash-stat__label">${label}</div></div>`;
  }
  function donutSVG(counts) {
    const data = [["Confirmed", counts.Confirmed, "#22c55e"], ["Pending", counts.Pending, "#eab308"], ["Cancelled", counts.Cancelled, "#ef4444"]];
    const total = data.reduce((s, d) => s + d[1], 0) || 1;
    let acc = 0, segs = "";
    const r = 52, cx = 60, cy = 60, circ = 2 * Math.PI * r;
    data.forEach(([name, v, color]) => {
      const frac = v / total;
      const dash = frac * circ;
      segs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="14"
        stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-acc * circ}" transform="rotate(-90 ${cx} ${cy})"></circle>`;
      acc += frac;
    });
    return `<svg width="120" height="120" viewBox="0 0 120 120">${segs}<text x="60" y="64" text-anchor="middle" fill="#fff" font-size="18" font-family="Playfair Display, serif">${total}</text></svg>`;
  }
  function lineSVG(vals, labels) {
    const w = 520, h = 180, pad = 30;
    const max = Math.max(...vals, 1), min = 0;
    const pts = vals.map((v, i) => {
      const x = pad + (i * (w - 2 * pad)) / (vals.length - 1);
      const y = h - pad - ((v - min) / (max - min)) * (h - 2 * pad);
      return [x, y];
    });
    const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = path + ` L ${pts[pts.length - 1][0].toFixed(1)} ${h - pad} L ${pts[0][0].toFixed(1)} ${h - pad} Z`;
    const dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="#C6A15B"></circle><text x="${p[0].toFixed(1)}" y="${h - 8}" text-anchor="middle" fill="#8A93A6" font-size="11">${labels[i]}</text>`).join("");
    return `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="margin-top:8px">
      <path d="${area}" fill="rgba(198,161,91,0.12)"></path>
      <path d="${path}" fill="none" stroke="#C6A15B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
      ${dots}</svg>`;
  }

  /* ---------------- Bookings management (dedicated) ---------------- */
  const BOOKING_STATUSES = ["Pending", "Confirmed", "Checked In", "Checked Out", "Cancelled", "No Show"];
  const PAYMENT_STATUSES = ["Unpaid", "Pending", "Paid", "Failed", "Refunded"];

  function nextActions(status) {
    switch (status) {
      case "Pending":    return ["confirm", "cancel"];
      case "Confirmed":  return ["checkin", "cancel"];
      case "Checked In": return ["checkout"];
      case "Checked Out":return [];
      case "Cancelled":  return [];
      case "No Show":    return [];
      default:           return [];
    }
  }
  const ACTION_LABEL = { confirm: "Confirm", cancel: "Cancel Booking", checkin: "Check In", checkout: "Check Out" };
  function nextPaymentActions(payment) {
    switch (payment || "Unpaid") {
      case "Unpaid":  return ["pay_pending", "pay_paid", "pay_refunded"];
      case "Pending": return ["pay_paid", "pay_failed", "pay_refunded"];
      case "Paid":    return ["pay_refunded"];
      case "Failed":  return [];
      case "Refunded":return [];
      default:        return [];
    }
  }
  function nextPaymentActionsForBooking(payment, bookingStatus) {
    const base = nextPaymentActions(payment);
    if ((bookingStatus === "Cancelled") && payment !== "Refunded" && !base.includes("pay_refunded")) {
      return base.concat("pay_refunded");
    }
    return base;
  }
  const PAY_ACTION_LABEL = {
    pay_pending: "Mark Pending", pay_paid: "Mark Paid",
    pay_failed: "Mark Failed", pay_refunded: "Mark Refunded"
  };
  const PAY_TO_STATUS = {
    pay_pending: "Pending", pay_paid: "Paid",
    pay_failed: "Failed", pay_refunded: "Refunded"
  };
  function statusTag(s) {
    const map = { "Checked In": "CheckedIn", "Checked Out": "CheckedOut", "No Show": "NoShow" };
    const cls = "tag tag-" + (map[s] || s);
    return `<span class="${cls}">${esc(s)}</span>`;
  }
  function payTag(p, provider) {
    var cls = "tag tag-" + (p === "Paid" ? "Paid" : p === "Unpaid" ? "Unpaid" : p);
    var prov = "";
    if (provider === "demo") prov = ' <span class="tag tag-demo" title="Demo payment">demo</span>';
    return `<span class="${cls}">${esc(p || "Unpaid")}</span>${prov}`;
  }
  const STATUS_KEY = {
    "Pending": "Pending", "Confirmed": "Confirmed", "Checked In": "Checked In",
    "Checked Out": "Checked Out", "Cancelled": "Cancelled", "No Show": "No Show"
  };
  const PAY_KEY = {
    "Unpaid": "Unpaid", "Pending": "Pending", "Paid": "Paid", "Failed": "Failed", "Refunded": "Refunded"
  };

  async function renderBookings(view) {
    const state = { q: "", status: "all", payment: "all", cinFrom: "", coutTo: "" };

    view.innerHTML = `
      <div class="dash-panel">
        <div class="dash-panel__head"><h3>${tr("Bookings Management")}</h3></div>
        <div class="bk-filters">
          <div class="field"><label>${tr("Search bookings…")}</label><input class="input" id="bkSearchInput" placeholder="${tr("Search bookings…")}"></div>
          <div class="field"><label>${tr("All Statuses")}</label><select class="select" id="bkStatusFilter">${['<option value="all">' + tr("All Statuses") + "</option>"].concat(BOOKING_STATUSES.map(s => `<option value="${s}">${tr(STATUS_KEY[s])}</option>`)).join("")}</select></div>
          <div class="field"><label>${tr("All Payments")}</label><select class="select" id="bkPayFilter">${['<option value="all">' + tr("All Payments") + "</option>"].concat(PAYMENT_STATUSES.map(s => `<option value="${s}">${tr(PAY_KEY[s])}</option>`)).join("")}</select></div>
          <div class="field"><label>${tr("Check-in from")}</label><input type="date" class="input" id="bkCinFrom"></div>
          <div class="field"><label>${tr("Check-out to")}</label><input type="date" class="input" id="bkCoutTo"></div>
        </div>
        <div id="bkStates"></div>
        <div class="bk-list" id="bkList"></div>
      </div>

      <div class="dash-modal" id="bkModal" hidden>
        <div class="dash-modal__box">
          <h3 id="bkModalTitle">${tr("Booking Details")}</h3>
          <div id="bkModalBody"></div>
          <div class="dash-modal__actions" id="bkModalActions"></div>
          <div class="dash-form__actions" style="margin-top:18px"><button type="button" class="btn-mini" id="bkModalClose">${tr("Cancel")}</button></div>
        </div>
      </div>`;

    const list = $("#bkList", view);
    const states = $("#bkStates", view);
    const modal = $("#bkModal", view);
    const modalBody = $("#bkModalBody", view);
    const modalActions = $("#bkModalActions", view);

    bkCloseMenus = () => {
      list.querySelectorAll(".bk-more-menu:not([hidden])").forEach(m => {
        m.hidden = true;
        const btn = m.parentElement.querySelector(".bk-more-btn");
        if (btn) btn.setAttribute("aria-expanded", "false");
      });
    };

    async function load() {
      states.innerHTML = `<div class="dash-loading">${tr("Loading bookings…")}</div>`;
      list.innerHTML = "";
      let items;
      try {
        items = (await Data.list("bookings")) || [];
      } catch (e) {
        states.innerHTML = `<div class="dash-loading" style="color:#f0a3a3">${tr("Could not load bookings")}</div>`;
        return;
      }
      states.innerHTML = "";

      const q = state.q.trim().toLowerCase();
      const filtered = items.filter(b => {
        if (q) {
          const hay = [b.id, b.guestName || b.guest, b.email, b.phone].join(" ").toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (state.status !== "all" && (b.status || "Pending") !== state.status) return false;
        if (state.payment !== "all" && (b.paymentStatus || "Unpaid") !== state.payment) return false;
        if (state.cinFrom && (b.checkin || "") < state.cinFrom) return false;
        if (state.coutTo && (b.checkout || "") > state.coutTo) return false;
        return true;
      });

      if (!filtered.length) {
        list.innerHTML = emptyState("📅", tr("No bookings found"), tr("No bookings"));
        return;
      }

      list.innerHTML = filtered.map(b => {
        const actions = nextActions(b.status || "Pending");
        const payActions = nextPaymentActionsForBooking(b.paymentStatus, b.status || "Pending");
        const isAttention = b.status === "Pending";
        const totalVal = b.total != null ? b.total : b.revenue;
        const paymentStatus = b.paymentStatus || "Unpaid";
        const payProvider = (b.payments && b.payments[0] && b.payments[0].provider) || null;

        // Primary action button
        const firstAction = actions[0];
        let primaryBtn;
        if (firstAction) {
          if (firstAction === "cancel") {
            primaryBtn = `<button class="btn-mini bk-primary danger" data-act="${firstAction}" data-id="${b.id}">${tr(ACTION_LABEL[firstAction])}</button>`;
          } else {
            primaryBtn = `<button class="btn-mini bk-primary btn--gold" data-act="${firstAction}" data-id="${b.id}">${tr(ACTION_LABEL[firstAction])}</button>`;
          }
        } else {
          primaryBtn = `<button class="btn-mini bk-primary" data-view="${b.id}">${tr("View")}</button>`;
        }

        // ⋯ menu items
        const menuItems = [];
        menuItems.push(`<button class="bk-more-item" data-view="${b.id}" role="menuitem">${tr("View details")}</button>`);
        actions.forEach(a => {
          const cls = a === "cancel" ? ' class="bk-more-item bk-more-item--danger"' : ' class="bk-more-item"';
          menuItems.push(`<button${cls} data-act="${a}" data-id="${b.id}" role="menuitem">${tr(ACTION_LABEL[a])}</button>`);
        });
        payActions.forEach(a => {
          menuItems.push(`<button class="bk-more-item" data-pay="${a}" data-id="${b.id}" role="menuitem">${tr(PAY_ACTION_LABEL[a])}</button>`);
        });

        const guestName = esc(b.guestName || b.guest || "");
        const guestEmail = b.email ? esc(b.email) : "";
        const roomName = esc(b.roomName || b.room || "");
        const checkin = esc(b.checkin || "");
        const checkout = esc(b.checkout || "");
        const guests = b.guests != null ? b.guests : ((b.adults || 0) + (b.children || 0));

        return `<div class="bk-row" ${isAttention ? 'data-attention="true"' : ""}>
          <div class="bk-row__guest">
            <span class="bk-row__guest-name">${guestName}</span>
            ${guestEmail ? `<span class="bk-row__guest-email">${guestEmail}</span>` : ""}
          </div>
          <div class="bk-row__room">${roomName}</div>
          <div class="bk-row__stay">
            <span class="bk-row__stay-dates">${checkin}<span class="bk-row__stay-arrow">→</span>${checkout}</span>
          </div>
          <span class="bk-row__guests">${guests}</span>
          <div class="bk-row__total">${money(totalVal)}</div>
          <div class="bk-row__statuses">
            ${statusTag(b.status || "Pending")}
            ${payTag(paymentStatus, payProvider)}
          </div>
          <div class="bk-row__actions">
            ${primaryBtn}
            <span class="bk-mpos">
              <button class="bk-more-btn" aria-haspopup="true" aria-expanded="false" title="${tr("More actions")}">⋯</button>
              <div class="bk-more-menu" role="menu" hidden>
                ${menuItems.join("")}
              </div>
            </span>
          </div>
        </div>`;
      }).join("");
    }

    function statusUpdate(id, patch, okMsg) {
      return async () => {
        try {
          await Data.update("bookings", id, patch);
          toast(tr(okMsg));
          modal.hidden = true;
          await load();
          refreshNotifications();
        } catch (e) {
          console.error("[PAYMENT UPDATE] FAILED:", e.message);
          toast(tr("Error") + ": " + e.message, "err");
        }
      };
    }

    function openDetails(b) {
      const row = (k, v) => `<dt>${tr(k)}</dt><dd>${esc(v == null ? "" : v)}</dd>`;
      modalBody.innerHTML = `<dl class="dash-dl">
        ${row("Reference", b.id)}
        ${row("Guest", b.guestName || b.guest)}
        ${row("Email", b.email)}
        ${row("Phone", b.phone)}
        ${row("Room", b.roomName || b.room)}
        ${row("Check-in", b.checkin)}
        ${row("Check-out", b.checkout)}
        ${row("Adults", b.adults)}
        ${row("Children", b.children)}
        ${row("Rooms", b.rooms)}
        ${row("Nights", b.nights)}
        ${row("Total", moneyCode(b.total != null ? b.total : b.revenue))}
        ${row("Status", b.status || "Pending")}
        ${row("Payment", b.paymentStatus || "Unpaid")}
        ${b.cancelReason ? '<div class="bk-cancel-reason"><strong>' + tr("Reason") + ':</strong> ' + esc(b.cancelReason) + '</div>' : ""}
        ${row("Created", b.created)}
      </dl>`;
      const actions = nextActions(b.status || "Pending");
      const payActions = nextPaymentActionsForBooking(b.paymentStatus, b.status || "Pending");
      modalActions.innerHTML = adminOk
        ? actions.map(a =>
            `<button class="btn-mini ${a === "cancel" ? "danger" : "btn--gold"}" data-act="${a}">${tr(ACTION_LABEL[a])}</button>`
          ).join("") +
          (payActions.length ? `<span class="bk-sep"></span><span class="bk-act-label">${tr("Payment:")}</span>` +
            payActions.map(a => `<button class="btn-mini" data-pay="${a}">${tr(PAY_ACTION_LABEL[a])}</button>`).join("") : "")
        : `<span class="dash-note">${tr("Admin claim required")}</span>`;
      modalActions.querySelectorAll("[data-act]").forEach(btn => {
        const a = btn.dataset.act;
        let patch = {};
        if (a === "confirm") patch = { status: "Confirmed" };
        else if (a === "cancel") patch = { status: "Cancelled" };
        else if (a === "checkin") patch = { status: "Checked In" };
        else if (a === "checkout") patch = { status: "Checked Out" };
        btn.addEventListener("click", statusUpdate(b.id, patch, "Booking updated"));
      });
      modalActions.querySelectorAll("[data-pay]").forEach(btn => {
        const a = btn.dataset.pay;
        statusUpdate(b.id, { paymentStatus: PAY_TO_STATUS[a] }, "Booking updated")(btn);
      });
      modal.hidden = false;
    }

    $("#bkSearchInput", view).addEventListener("input", e => { state.q = e.target.value; load(); });
    $("#bkStatusFilter", view).addEventListener("change", e => { state.status = e.target.value; load(); });
    $("#bkPayFilter", view).addEventListener("change", e => { state.payment = e.target.value; load(); });
    $("#bkCinFrom", view).addEventListener("change", e => { state.cinFrom = e.target.value; load(); });
    $("#bkCoutTo", view).addEventListener("change", e => { state.coutTo = e.target.value; load(); });

    list.addEventListener("click", async (e) => {
      // ⋯ menu toggle
      const moreBtn = e.target.closest(".bk-more-btn");
      if (moreBtn) {
        e.stopPropagation();
        const mpos = moreBtn.closest(".bk-mpos");
        const menu = mpos ? mpos.querySelector(".bk-more-menu") : null;
        if (menu) {
          const isOpen = !menu.hidden;
          bkCloseMenus();
          if (!isOpen) {
            menu.hidden = false;
            moreBtn.setAttribute("aria-expanded", "true");
          }
        }
        return;
      }

      // View details (from primary btn or menu item)
      const viewBtn = e.target.closest("[data-view]");
      if (viewBtn) {
        bkCloseMenus();
        const id = viewBtn.dataset.view;
        const b = (await Data.list("bookings")).find(x => x.id === id);
        if (b) openDetails(b);
        return;
      }

      // Status actions (from primary btn or menu item)
      const actBtn = e.target.closest("[data-act]");
      if (actBtn) {
        bkCloseMenus();
        const id = actBtn.dataset.id, a = actBtn.dataset.act;
        let patch = {};
        if (a === "confirm") patch = { status: "Confirmed" };
        else if (a === "cancel") patch = { status: "Cancelled" };
        else if (a === "checkin") patch = { status: "Checked In" };
        else if (a === "checkout") patch = { status: "Checked Out" };
        await statusUpdate(id, patch, "Booking updated")();
      }

      // Payment actions (from menu items)
      const payBtn = e.target.closest("[data-pay]");
      if (payBtn) {
        bkCloseMenus();
        const id = payBtn.dataset.id, a = payBtn.dataset.pay;
        await statusUpdate(id, { paymentStatus: PAY_TO_STATUS[a] }, "Booking updated")();
      }
    });

    $("#bkModalClose", view).addEventListener("click", () => modal.hidden = true);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });

    localizeView(view);
    currentSection = "bookings";
    await load();
  }

  /* ---------------- Reviews (dedicated with tabs) ---------------- */
  async function renderReviews(view) {
    const REVIEW_STATUSES = ["Pending", "Published", "Rejected"];
    const state = { filter: "ALL" };

    async function getCounts() {
      let items;
      try { items = (await Data.list("reviews")) || []; }
      catch (e) { return { ALL: 0, Pending: 0, Published: 0, Rejected: 0 }; }
      return {
        ALL: items.length,
        Pending: items.filter(r => r.status === "Pending").length,
        Published: items.filter(r => r.status === "Published").length,
        Rejected: items.filter(r => r.status === "Rejected").length
      };
    }

    const counts = await getCounts();

    view.innerHTML = `
      <div class="dash-panel">
        <div class="dash-panel__head">
          <h3>${tr("Reviews Management")}</h3>
        </div>
        <div class="dash-tabs" id="rvTabs">
          <button class="dash-tab ${state.filter === "ALL" ? "active" : ""}" data-filter="ALL">${tr("All")} <span class="dash-tab__count">${counts.ALL}</span></button>
          <button class="dash-tab ${state.filter === "Pending" ? "active" : ""}" data-filter="Pending">${tr("Pending")} <span class="dash-tab__count" ${counts.Pending > 0 ? 'style="background:var(--dash-warning-bg);color:var(--dash-warning)"' : ""}>${counts.Pending}</span></button>
          <button class="dash-tab ${state.filter === "Published" ? "active" : ""}" data-filter="Published">${tr("Published")} <span class="dash-tab__count">${counts.Published}</span></button>
          <button class="dash-tab ${state.filter === "Rejected" ? "active" : ""}" data-filter="Rejected">${tr("Rejected")} <span class="dash-tab__count">${counts.Rejected}</span></button>
        </div>
        <div id="rvStates"></div>
        <div class="table-wrap">
          <table class="dash-table">
            <thead><tr>
              <th>${tr("Name")}</th><th>${tr("Email")}</th><th>${tr("Rating")}</th>
              <th>${tr("Review")}</th><th>${tr("Status")}</th><th>${tr("Created")}</th><th>${tr("Actions")}</th>
            </tr></thead>
            <tbody id="rvTbody"></tbody>
          </table>
        </div>
      </div>`;

    const tbody = $("#rvTbody", view);
    const states = $("#rvStates", view);

    function reviewStatusTag(s) {
      const cls = "tag tag-" + (s || "Pending");
      return `<span class="${cls}">${tr(s || "Pending")}</span>`;
    }

    async function load() {
      states.innerHTML = `<div class="dash-loading">${tr("Loading reviews…")}</div>`;
      tbody.innerHTML = "";
      let items;
      try {
        items = (await Data.list("reviews")) || [];
      } catch (e) {
        states.innerHTML = `<div class="dash-loading" style="color:#f0a3a3">${tr("Could not load reviews")}</div>`;
        return;
      }
      states.innerHTML = "";

      const filtered = state.filter === "ALL" ? items : items.filter(r => r.status === state.filter);

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7">${emptyState("★", tr("No reviews found"), tr("No reviews found"))}</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(r => {
        const isAttention = r.status === "Pending";
        const btns = adminOk
          ? (r.status === "Pending"
              ? `<button class="btn-mini btn--gold" data-status="Published" data-id="${r.id}">${tr("Publish")}</button>
                 <button class="btn-mini" data-status="Rejected" data-id="${r.id}">${tr("Reject")}</button>`
              : r.status === "Rejected"
              ? `<button class="btn-mini btn--gold" data-status="Published" data-id="${r.id}">${tr("Publish")}</button>`
              : r.status === "Published"
              ? `<button class="btn-mini" data-status="Rejected" data-id="${r.id}">${tr("Reject")}</button>`
              : "") +
            `<button class="btn-mini danger" data-del="${r.id}">${tr("Delete")}</button>`
          : "";
        return `<tr ${isAttention ? 'data-attention="true"' : ""}>
          <td data-label="${tr("Author")}"><div class="dash-cell-guest"><span class="dash-cell-guest__name">${esc(r.author || "")}</span></div></td>
          <td data-label="${tr("Email")}">${esc(r.email || "–")}</td>
          <td data-label="${tr("Rating")}">${"★".repeat(r.rating || 0)}${"☆".repeat(5 - (r.rating || 0))}</td>
          <td data-label="${tr("Review")}" style="max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.text || r.comment || "")}</td>
          <td data-label="${tr("Status")}">${reviewStatusTag(r.status)}</td>
          <td data-label="${tr("Created")}">${esc(r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "")}</td>
          <td data-label="${tr("Actions")}" class="dash-actions">${btns}</td>
        </tr>`;
      }).join("");
    }

    view.querySelectorAll(".dash-tab").forEach(tab => {
      tab.addEventListener("click", async () => {
        state.filter = tab.dataset.filter;
        view.querySelectorAll(".dash-tab").forEach(t => t.classList.toggle("active", t.dataset.filter === state.filter));
        await load();
      });
    });

    tbody.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-status]");
      if (btn) {
        const id = btn.dataset.id;
        const status = btn.dataset.status;
        const dbStatus = { "Published": "PUBLISHED", "Rejected": "REJECTED", "Pending": "PENDING" };
        try {
          await MGApiClient.adminUpdate("reviews", id, { status: dbStatus[status] || status });
          toast(tr("Review updated"));
          await load();
          const newCounts = await getCounts();
          Object.keys(newCounts).forEach(k => {
            const countEl = view.querySelector(`.dash-tab[data-filter="${k}"] .dash-tab__count`);
            if (countEl) {
              countEl.textContent = newCounts[k];
              if (k === "Pending" && newCounts[k] > 0) {
                countEl.style.background = "var(--dash-warning-bg)";
                countEl.style.color = "var(--dash-warning)";
              } else {
                countEl.style.background = "";
                countEl.style.color = "";
              }
            }
          });
          refreshNotifications();
        } catch (err) { toast(tr("Error") + ": " + err.message, "err"); }
        return;
      }
      const delBtn = e.target.closest("[data-del]");
      if (delBtn) {
        if (!confirm(tr("Delete this review?"))) return;
        try {
          await Data.remove("reviews", delBtn.dataset.del);
          toast(tr("Deleted"));
          await load();
          refreshNotifications();
        } catch (err) { toast(tr("Error") + ": " + err.message, "err"); }
      }
    });

    localizeView(view);
    currentSection = "reviews";
    await load();
  }

  /* ---------------- Generic CRUD ---------------- */
  async function renderCrud(view, col, cfg) {
    const items = await Data.list(col);
    const rows = items.map(it => `
      <tr>
        ${cfg.cols.map(c => {
          let v = it[c];
          if (c === "featured") v = v ? "★" : "–";
          if (Array.isArray(v)) v = v.join(", ");
          if (cfg.media && c === "url") return `<td data-label="${tr(c.charAt(0).toUpperCase() + c.slice(1))}"><img src="${esc(v)}" class="dash-thumb" alt=""></td>`;
          return `<td data-label="${tr(c.charAt(0).toUpperCase() + c.slice(1))}">${esc(v)}</td>`;
        }).join("")}
        <td data-label="${tr("Actions")}" class="dash-actions">
          ${adminOk
            ? `<button class="btn-mini" data-edit="${it.id}">${tr("Edit")}</button>
               <button class="btn-mini danger" data-del="${it.id}">${tr("Delete")}</button>`
            : `<span class="dash-note">${tr("Admin claim required")}</span>`}
        </td>
      </tr>`).join("");

    view.innerHTML = `
      <div class="dash-panel">
        <div class="dash-panel__head">
          <h3>${tr(col.charAt(0).toUpperCase() + col.slice(1))}</h3>
          ${adminOk ? `<button class="btn btn--gold btn--sm" id="addBtn">+ ${tr("Add")} ${tr(col.slice(0, -1))}</button>` : ""}
        </div>
        ${items.length ? `<div class="table-wrap">
          <table class="dash-table">
            <thead><tr>${cfg.cols.map(c => `<th>${tr(c.charAt(0).toUpperCase() + c)}</th>`).join("")}<th>${tr("Actions")}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : emptyState("📋", tr("No records"), tr("No records"), adminOk ? `<button class="btn btn--gold btn--sm" id="addBtnEmpty">+ ${tr("Add")} ${tr(col.slice(0, -1))}</button>` : "")}
      </div>
      <div class="dash-modal" id="modal" hidden>
        <div class="dash-modal__box">
          <h3 id="modalTitle">${tr("Add")}</h3>
          <form id="modalForm" class="dash-form">
            ${cfg.fields.map(f => fieldHtml(f)).join("")}
            <div class="dash-form__actions">
              <button type="button" class="btn-mini" id="cancelBtn">${tr("Cancel")}</button>
              <button type="submit" class="btn btn--gold btn--sm">${tr("Save")}</button>
            </div>
          </form>
        </div>
      </div>`;

    const modal = $("#modal");
    const openModal = (item) => {
      $("#modalTitle").textContent = item ? tr("Edit") : tr("Add");
      cfg.fields.forEach(f => {
        const wrap = $(`[data-field="${f.k}"]`, modal);
        if (!wrap) return;
        const input = wrap.querySelector("input, textarea, select");
        if (!input) return;
        let val = item ? item[f.k] : "";
        if (f.type === "checkbox") input.checked = !!val;
        else if (f.type === "image") {
          input.value = "";
        }
        else if (Array.isArray(val)) input.value = val.join(", ");
        else input.value = val == null ? "" : val;
        if (f.type === "image") {
          const pv = wrap.querySelector(".img-prev");
          if (pv) {
            if (item && item[f.k]) { pv.src = item[f.k]; pv.style.display = "block"; }
            else { pv.src = ""; pv.style.display = "none"; }
          }
          const existing = wrap.querySelector(".img-existing");
          if (existing) existing.value = item && item[f.k] ? item[f.k] : "";
        }
      });
      modal.dataset.editId = item ? item.id : "";
      modal.hidden = false;
    };

    const addBtn = $("#addBtn") || $("#addBtnEmpty");
    if (addBtn) addBtn.addEventListener("click", () => { if (!adminOk) return; openModal(null); });
    $("#cancelBtn").addEventListener("click", () => modal.hidden = true);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });

    modal.addEventListener("change", (e) => {
      if (e.target.type === "file" && e.target.files && e.target.files[0]) {
        const wrap = e.target.closest("[data-field]");
        if (!wrap) return;
        const pv = wrap.querySelector(".img-prev");
        if (pv) {
          pv.src = URL.createObjectURL(e.target.files[0]);
          pv.style.display = "block";
        }
      }
    });

    $$("[data-edit]", view).forEach(b => b.addEventListener("click", async () => {
      const item = (await Data.list(col)).find(x => x.id === b.dataset.edit);
      openModal(item);
    }));
    $$("[data-del]", view).forEach(b => b.addEventListener("click", async () => {
      if (!confirm(tr("Delete this record?"))) return;
      await Data.remove(col, b.dataset.del);
      toast(tr("Deleted")); showSection(col);
    }));

    $("#modalForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!adminOk) return;
      const item = {};
      for (const f of cfg.fields) {
        const wrap = $(`[data-field="${f.k}"]`, modal);
        const input = wrap.querySelector("input, textarea, select");
        let val;
        if (f.type === "checkbox") val = input.checked;
        else if (f.type === "number") val = Number(input.value);
        else if (f.type === "image") {
          const fileInput = wrap.querySelector('input[type="file"]');
          const existingInput = wrap.querySelector(".img-existing");
          if (fileInput && fileInput.files && fileInput.files[0]) {
            toast(tr("Uploading image…"), "info");
            try {
              const result = await Data.uploadImage(fileInput.files[0], col);
              val = (result && result.url) ? result.url : (existingInput ? existingInput.value : "");
              if (val) toast(tr("Image uploaded."), "ok");
            } catch (err) {
              val = existingInput ? existingInput.value : "";
              toast(tr("Upload failed:") + " " + err.message, "err");
            }
          } else {
            val = existingInput ? existingInput.value : "";
          }
        }
        else if (f.k === "amenities") val = input.value.split(",").map(s => s.trim()).filter(Boolean);
        else val = input.value;
        item[f.k] = val;
      }
      const editingId = modal.dataset.editId;
      if (editingId) { await Data.update(col, editingId, item); toast(tr("Updated")); }
      else { await Data.add(col, item); toast(tr("Added")); }
      modal.hidden = true; showSection(col);
    });
  }

  function fieldHtml(f) {
    const attrs = `data-field="${f.k}"`, lbl = tr(f.label);
    if (f.type === "textarea") return `<label ${attrs}>${lbl}<textarea name="${f.k}" rows="3"></textarea></label>`;
    if (f.type === "select") return `<label ${attrs}>${lbl}<select name="${f.k}">${f.options.map(o => `<option>${tr(o)}</option>`).join("")}</select></label>`;
    if (f.type === "checkbox") return `<label class="dash-check" ${attrs}><input type="checkbox" name="${f.k}"> ${lbl}</label>`;
    if (f.type === "image") return `<label ${attrs}>${lbl}
      <input type="file" name="${f.k}" accept="image/jpeg,image/png,image/webp">
      <img class="img-prev" alt="" style="display:none;max-width:120px;border-radius:8px;margin-top:8px">
      <input type="hidden" class="img-existing" value="">
      <small class="dash-hint">${Data.mode === "rest" ? tr("Select an image (JPEG, PNG, WebP, max 5 MB).") : tr("Select an image file.")}</small>
    </label>`;
    return `<label ${attrs}>${lbl}<input type="${f.type}" name="${f.k}" ${f.type === "number" ? 'step="any"' : ''}></label>`;
  }

  /* ---------------- Rooms (custom CRUD with quantity + dynamic type + archive) ---------------- */
  async function renderRooms(view, filter) {
    const allItems = await Data.list("rooms");
    const roomTypes = (window.MGApiClient && window.MGApiClient.listRoomTypes)
      ? await window.MGApiClient.listRoomTypes() : [];

    filter = filter || "all";
    const items = filter === "active" ? allItems.filter(r => r.isActive !== false)
      : filter === "archived" ? allItems.filter(r => r.isActive === false)
      : allItems;

    const rows = items.map(it => {
      const isActive = it.isActive !== false;
      const statusLabel = isActive ? tr("Active") : tr("Archived");
      const statusClass = isActive ? "status-active" : "status-archived";
      return `
      <tr>
        <td>${esc(it.name || "")}</td>
        <td>${esc(it.type || "")}</td>
        <td>${esc(String(it.quantity != null ? it.quantity : 1))}</td>
        <td>${esc(String(it.price || ""))}</td>
        <td><span class="${statusClass}">${statusLabel}</span></td>
        <td>${it.image ? '<img src="' + esc(it.image) + '" class="dash-thumb" alt="">' : ""}</td>
        <td class="dash-actions">
          ${adminOk
            ? `<button class="btn-mini" data-edit="${it.id}">${tr("Edit")}</button>
               ${isActive
                 ? `<button class="btn-mini warn" data-archive="${it.id}">${tr("Archive")}</button>`
                 : `<button class="btn-mini" data-restore="${it.id}">${tr("Restore")}</button>`}
               <button class="btn-mini danger" data-del="${it.id}">${tr("Delete")}</button>`
            : `<span class="dash-note">${tr("Admin claim required")}</span>`}
        </td>
      </tr>`;
    }).join("");

    view.innerHTML = `
      <div class="dash-panel">
        <div class="dash-panel__head">
          <h3>${tr("Rooms")}</h3>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="roomFilter" class="dash-filter">
              <option value="all" ${filter === "all" ? "selected" : ""}>${tr("All")}</option>
              <option value="active" ${filter === "active" ? "selected" : ""}>${tr("Active")}</option>
              <option value="archived" ${filter === "archived" ? "selected" : ""}>${tr("Archived")}</option>
            </select>
            ${adminOk ? `<button class="btn btn--gold btn--sm" id="addBtn">+ ${tr("Add")} ${tr("Room")}</button>` : ""}
          </div>
        </div>
        ${items.length ? `<div class="table-wrap">
          <table class="dash-table">
            <thead><tr>
              <th>${tr("Name")}</th><th>${tr("Type")}</th><th>${tr("Qty")}</th>
              <th>${tr("Price")}</th><th>${tr("Status")}</th><th>${tr("Image")}</th><th>${tr("Actions")}</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : emptyState("🛏", tr("No records"), tr("No records"), adminOk ? `<button class="btn btn--gold btn--sm" id="addBtn">+ ${tr("Add")} ${tr("Room")}</button>` : "")}
      </div>
      <div class="dash-modal" id="modal" hidden>
        <div class="dash-modal__box">
          <h3 id="modalTitle">${tr("Add")}</h3>
          <form id="modalForm" class="dash-form">
            <label data-field="name">${tr("Room Name")}<input name="name" required></label>
            <label data-field="type">${tr("Room Type")}
              <input name="type" id="roomTypeInput" list="roomTypeList" required autocomplete="off" placeholder="${tr("Type or select…")}">
              <datalist id="roomTypeList">${roomTypes.map(t => `<option value="${esc(t)}">`).join("")}</datalist>
            </label>
            <label data-field="quantity">${tr("Number of Rooms")}<input name="quantity" type="number" min="1" step="1" value="1" required></label>
            <label data-field="price">${tr("Price / night")}<input name="price" type="number" step="any" required></label>
            <label data-field="desc">${tr("Description")}<textarea name="desc" rows="3"></textarea></label>
            <label data-field="amenities">${tr("Amenities (comma)")}<input name="amenities"></label>
            <label data-field="image">${tr("Image")}
              <input type="file" accept="image/*">
              <input type="hidden" class="img-existing" name="imageExisting">
              <img class="img-prev" style="display:none;max-width:200px;margin-top:6px" alt="">
              <small class="dash-hint">${Data.mode === "rest" ? tr("Select an image (JPEG, PNG, WebP, max 5 MB).") : tr("Select an image file.")}</small>
            </label>
            <div class="dash-form__actions">
              <button type="button" class="btn-mini" id="cancelBtn">${tr("Cancel")}</button>
              <button type="submit" class="btn btn--gold btn--sm">${tr("Save")}</button>
            </div>
          </form>
        </div>
      </div>`;

    const filterEl = $("#roomFilter");
    if (filterEl) filterEl.addEventListener("change", () => renderRooms(view, filterEl.value));

    const modal = $("#modal");
    const openModal = (item) => {
      $("#modalTitle").textContent = item ? tr("Edit") : tr("Add");
      const fields = { name: "", type: "", quantity: 1, price: "", desc: "", amenities: "", image: "" };
      Object.keys(fields).forEach(k => {
        const wrap = $("[data-field='" + k + "']", modal);
        if (!wrap) return;
        const input = wrap.querySelector("input:not([type=file]):not(.img-existing), textarea");
        if (!input) return;
        let val = item ? (item[k] != null ? item[k] : fields[k]) : fields[k];
        if (k === "amenities" && Array.isArray(val)) val = val.join(", ");
        input.value = val;
      });
      if (item && item.image) {
        const pv = $(".img-prev", modal);
        if (pv) { pv.src = item.image; pv.style.display = "block"; }
        const ex = $(".img-existing", modal);
        if (ex) ex.value = item.image;
      }
      modal.dataset.editId = item ? item.id : "";
      modal.hidden = false;
    };

    const addBtn = $("#addBtn");
    if (addBtn) addBtn.addEventListener("click", () => { if (!adminOk) return; openModal(null); });
    const cancelBtn = $("#cancelBtn");
    if (cancelBtn) cancelBtn.addEventListener("click", () => modal.hidden = true);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });

    $$("[data-edit]", view).forEach(b => b.addEventListener("click", async () => {
      const item = (await Data.list("rooms")).find(x => x.id === b.dataset.edit);
      openModal(item);
    }));

    $$("[data-archive]", view).forEach(b => b.addEventListener("click", async () => {
      if (!adminOk) return;
      try {
        await Data.update("rooms", b.dataset.archive, { isActive: false });
        toast(tr("Room archived successfully"));
        showSection("rooms");
      } catch (err) {
        toast(tr("Archive failed:") + " " + (err.message || tr("Error")), "err");
      }
    }));

    $$("[data-restore]", view).forEach(b => b.addEventListener("click", async () => {
      if (!adminOk) return;
      try {
        await Data.update("rooms", b.dataset.restore, { isActive: true });
        toast(tr("Room restored successfully"));
        showSection("rooms");
      } catch (err) {
        toast(tr("Restore failed:") + " " + (err.message || tr("Error")), "err");
      }
    }));

    $$("[data-del]", view).forEach(b => b.addEventListener("click", async () => {
      if (!confirm(tr("Delete this record?"))) return;
      try {
        await Data.remove("rooms", b.dataset.del);
        toast(tr("Deleted"));
        showSection("rooms");
      } catch (err) {
        toast(tr("Cannot delete: ") + (err.message || tr("Error")), "err");
      }
    }));

    $("#modalForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!adminOk) return;
      const f = e.target;
      const nameVal = f.querySelector("[name=name]").value.trim();
      const typeVal = f.querySelector("[name=type]").value.trim();
      const qtyVal = Math.max(1, parseInt(f.querySelector("[name=quantity]").value, 10) || 1);
      const priceVal = Number(f.querySelector("[name=price]").value) || 0;
      const descVal = f.querySelector("[name=desc]").value;
      const amenVal = f.querySelector("[name=amenities]").value.split(",").map(s => s.trim()).filter(Boolean);
      if (!nameVal || !typeVal) { toast(tr("Name and Type are required"), "err"); return; }

      const item = { name: nameVal, type: typeVal, quantity: qtyVal, price: priceVal, desc: descVal, amenities: amenVal };

      const fileInput = f.querySelector('input[type="file"]');
      const existingInput = f.querySelector(".img-existing");
      if (fileInput && fileInput.files && fileInput.files[0]) {
        toast(tr("Uploading image…"), "info");
        try {
          const result = await Data.uploadImage(fileInput.files[0], "rooms");
          item.image = (result && result.url) ? result.url : (existingInput ? existingInput.value : "");
          if (item.image) toast(tr("Image uploaded."), "ok");
        } catch (err) {
          item.image = existingInput ? existingInput.value : "";
          toast(tr("Upload failed:") + " " + err.message, "err");
        }
      } else {
        item.image = existingInput ? existingInput.value : "";
      }

      const editingId = modal.dataset.editId;
      if (editingId) { await Data.update("rooms", editingId, item); toast(tr("Updated")); }
      else { await Data.add("rooms", item); toast(tr("Added")); }
      modal.hidden = true; showSection("rooms");
    });
  }

  async function renderHotel(view) {
    const info = await Data.getDoc("hotel") || {};
    view.innerHTML = `
      <div class="dash-panel">
        <h3>${tr("Hotel Information")}</h3>
        <form id="hotelForm" class="dash-form">
          <label>${tr("Name")}<input name="name" value="${esc(info.name || "")}"></label>
          <label>${tr("Tagline")}<input name="tagline" value="${esc(info.tagline || "")}"></label>
          <label>${tr("Email")}<input name="email" value="${esc(info.email || "")}"></label>
          <label>${tr("Phone")}<input name="phone" value="${esc(info.phone || "")}"></label>
          <label>${tr("Address")}<input name="address" value="${esc(info.address || "")}"></label>
          <label>${tr("About")}<textarea name="about" rows="3">${esc(info.about || "")}</textarea></label>
          <div class="dash-form__actions"><button type="submit" class="btn btn--gold btn--sm">${tr("Save")}</button></div>
        </form>
      </div>`;
    $("#hotelForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!adminOk) return;
      const fd = new FormData(e.target); const obj = {}; fd.forEach((v, k) => obj[k] = v);
      await Data.set("hotel", obj);
      toast(tr("Hotel info saved"));
      await renderHotel(view);
    });
  }

  async function renderSettings(view) {
    const s = await Data.getDoc("settings") || {};
    view.innerHTML = `
      <div class="dash-panel">
        <h3>${tr("Settings")}</h3>
        <form id="setForm" class="dash-form">
          <label>${tr("Default Theme")}
            <select name="theme"><option ${s.theme === "dark" ? "selected" : ""}>dark</option><option ${s.theme !== "dark" ? "selected" : ""}>light</option></select>
          </label>
          <label>${tr("Currency")}<input name="currency" value="${esc(s.currency || "USD")}"></label>
          <label>${tr("Default Language")}
            <select name="lang"><option ${s.lang === "ar" ? "selected" : ""}>ar</option><option ${s.lang !== "ar" ? "selected" : ""}>en</option></select>
          </label>
          <div class="dash-form__actions"><button type="submit" class="btn btn--gold btn--sm">${tr("Save")}</button></div>
        </form>
        <div class="dash-note">${tr("Mode:")} <b id="modeNote">${(Data.mode || "demo")}</b>. ${Data.mode === "rest" ? tr("Connected to PostgreSQL backend via REST API.") : tr("Running in demo mode.")}</div>
      </div>`;
    $("#setForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!adminOk) return;
      const fd = new FormData(e.target); const obj = {}; fd.forEach((v, k) => obj[k] = v);
      await Data.set("settings", obj);
      if (window.MGSettings && MGSettings.refresh) await MGSettings.refresh();
      toast(tr("Settings saved"));
      await renderSettings(view);
      if (obj.lang && window.MGLang && window.MGLang.apply) {
        window.MGLang.apply(obj.lang);
      }
      if (obj.theme) {
        document.documentElement.setAttribute("data-theme", obj.theme);
        localStorage.setItem("mg-theme", obj.theme);
      }
    });
  }

  /* ---------------- Logout ---------------- */
  async function logout() {
    localStorage.removeItem("mg-admin-jwt");
    localStorage.removeItem("mg-user-jwt");
    sessionStorage.removeItem("mg-auth");
    window.location.replace("pages/account.html");
  }

  async function bootDashboard() {
    buildShell();
    const m = await ready(); Data.mode = m;
    let ok = true;
    if (m === "rest") {
      try { await assertAdmin(); adminOk = true; }
      catch (e) { ok = false; }
    } else { adminOk = true; }
    if (!ok) { redirectToAccount(); return; }

    /* Ensure settings (including currency) are loaded before rendering */
    if (window.MGSettings && MGSettings.load) {
      try { await MGSettings.load(); } catch (e) { /* use defaults */ }
    }

    const modeEl = $("#dashMode");
    if (modeEl) modeEl.textContent = m + (m === "demo" ? tr(" (no keys)") : "");
    const authEl = $("#dashEmail");
    if (m === "rest" && window.MGApiClient) {
      try {
        const user = await window.MGApiClient.adminMe();
        if (authEl) authEl.textContent = user.email || "admin";
      } catch (e) { if (authEl) authEl.textContent = "admin"; }
    }

    refreshNotifications();
    showSection("home");
    if (window.MGLang) document.addEventListener("lang:change", () => { if (currentSection) showSection(currentSection); });
  }

  function initDash() {
    if (!document.getElementById("dash")) return;
    if (window.MGApiClient && window.MGApiClient.getToken()) {
      assertAdmin().then(() => bootDashboard()).catch(() => {
        redirectToAccount();
      });
      return;
    }
    if (sessionStorage.getItem("mg-auth")) {
      var savedAuth = sessionStorage.getItem("mg-auth");
      if (savedAuth === "rest") {
        if (window.MGApiClient && window.MGApiClient.getToken()) {
          assertAdmin().then(() => bootDashboard()).catch(() => {
            redirectToAccount();
          });
        } else {
          redirectToAccount();
        }
        return;
      }
      bootDashboard();
      return;
    }
    redirectToAccount();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initDash);
  else initDash();
})();
