/* =========================================================
   dashboard.js — Admin dashboard (full build)
   Sections: Login · Home/Analytics · Rooms · Bookings · Customers
   · Reviews · Gallery · Restaurant (menu) · Amenities · Hotel Info
   · Settings · Logout
   Data layer: Firebase (Auth + Firestore + Storage) when configured,
   otherwise a local demo store (localStorage) so the UI is fully usable.
   ========================================================= */
(function () {
  "use strict";

  // Surface runtime errors visibly (so they aren't hidden in console)
  function showError(msg) {
    let box = document.getElementById("dashError");
    if (!box) {
      box = document.createElement("div");
      box.id = "dashError";
      box.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;background:#7f1d1d;color:#fff;padding:12px 14px;border-radius:10px;font:12px/1.5 monospace;white-space:pre-wrap;max-height:40vh;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,.4)";
      document.body.appendChild(box);
    }
    box.textContent = "Dashboard error:\n" + msg;
  }
  window.addEventListener("error", (e) => showError((e.message || e.error) + (e.filename ? "\n@ " + e.filename + ":" + e.lineno : "")));
  window.addEventListener("unhandledrejection", (e) => showError("Promise: " + (e.reason && e.reason.message ? e.reason.message : e.reason)));

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /* ---------------- Demo store (localStorage) ----------------
     SHARED key (mg-demo-db) is the single demo source. Both the
     admin dashboard AND the public booking flow (js/booking-core.js)
     read/write this same key/shape, so a public booking shows in
     admin and admin status changes affect public availability.
     The Demo object is stateless: it (re)loads from localStorage on
     every op so external mutations (public site) are always visible. */
  const DEMO_KEY = "mg-demo-db";
  // Canonical seed now lives in js/seed-data.js (window.__mgSeed).
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

  /* ---------------- Data abstraction ---------------- */
  let FB = null;
  async function ready() {
    if (window.MGFirebase && window.MGFirebase.ready) { FB = window.MGFirebase; return "firebase"; }
    return "demo";
  }

  const Data = {
    mode: "demo",
    async list(col) {
      if (this.mode === "firebase" && FB) {
        const { getDocs, collection, query, orderBy } = FB.fns;
        try {
          const snap = await getDocs(query(collection(FB.db, col), orderBy("__order", "desc")));
          return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) { return Demo.list(col); }
      }
      return Demo.list(col);
    },
    async add(col, item) {
      if (this.mode === "firebase" && FB) {
        const { addDoc, collection, serverTimestamp } = FB.fns;
        const { id } = await addDoc(collection(FB.db, col), { ...item, __order: Date.now(), updatedAt: serverTimestamp() });
        return { ...item, id };
      }
      return Demo.add(col, item);
    },
    async update(col, id, patch) {
      if (this.mode === "firebase" && FB) {
        const { doc, updateDoc, serverTimestamp } = FB.fns;
        await updateDoc(doc(FB.db, col, id), { ...patch, updatedAt: serverTimestamp() });
        return;
      }
      return Demo.update(col, id, patch);
    },
    async remove(col, id) {
      if (this.mode === "firebase" && FB) {
        const { doc, deleteDoc } = FB.fns;
        await deleteDoc(doc(FB.db, col, id));
        return;
      }
      return Demo.remove(col, id);
    },
    async set(col, obj) {
      if (this.mode === "firebase" && FB) {
        const { doc, setDoc, serverTimestamp } = FB.fns;
        await setDoc(doc(FB.db, col, "info"), { ...obj, updatedAt: serverTimestamp() });
        return;
      }
      return Demo.set(col, obj);
    },
    async getDoc(col) {
      if (this.mode === "firebase" && FB) {
        const { doc, getDoc } = FB.fns;
        const snap = await getDoc(doc(FB.db, col, "info"));
        return snap.exists() ? snap.data() : null;
      }
      return Demo.getDoc(col);
    },
    // Firebase Storage upload (returns download URL)
    async uploadImage(file, path) {
      if (this.mode === "firebase" && FB && FB.storage) {
        const { ref, uploadBytes, getDownloadURL } = FB.storageFns;
        const r = ref(FB.storage, path + "/" + Date.now() + "_" + file.name.replace(/\s+/g, "_"));
        await uploadBytes(r, file);
        return await getDownloadURL(r);
      }
      return null; // demo: caller keeps existing URL
    }
  };

  /* ---------------- Helpers ---------------- */
  function el(tag, attrs = {}, html = "") {
    const n = document.createElement(tag);
    for (const k in attrs) { if (k === "class") n.className = attrs[k]; else n.setAttribute(k, attrs[k]); }
    if (html) n.innerHTML = html;
    return n;
  }
  function toast(msg, type = "ok") {
    let t = $("#toast");
    if (!t) { t = el("div", { id: "toast" }); document.body.appendChild(t); }
    t.textContent = msg; t.className = "toast show " + type;
    clearTimeout(t._t); t._t = setTimeout(() => t.className = "toast", 2200);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function money(n) { return "$" + Number(n || 0).toLocaleString(); }

  /* ---------------- Dashboard i18n (EN/AR) ----------------
     Map of English source -> Arabic. Used to localize the
     dashboard independently of the public site dictionary. */
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
      "Upload an image (Firebase Storage) or keep the current URL.": "ارفع صورة (تخزين Firebase) أو احتفظ بالرابط الحالي.",
      "Mode:": "الوضع:", "Set your Firebase keys in": "أدخل مفاتيح Firebase في",
      "to enable cloud sync, auth & image storage.": "لتفعيل المزامنة والدخول وتخزين الصور.",
      "Delete this record?": "حذف هذا السجل؟", "Updated": "تم التحديث", "Added": "تمت الإضافة",
      "Hotel info saved": "تم حفظ معلومات الفندق", "Settings saved": "تم حفظ الإعدادات", "Deleted": "تم الحذف",
      "Add Room": "إضافة غرفة", "Add Booking": "إضافة حجز", "Add Customer": "إضافة عميل",
      "Add Review": "إضافة تقييم", "Add Gallery": "إضافة صورة", "Add Menu": "إضافة عنصر",
      "Add Amenity": "إضافة مرفق", "Login failed:": "فشل الدخول:",
      "Bookings Management": "إدارة الحجوزات", "Search bookings…": "بحث في الحجوزات…",
      "All Statuses": "كل الحالات", "All Payments": "كل المدفوعات",
      "Check-in from": "الوصول من", "Check-out to": "المغادرة إلى",
      "Reference": "المرجع", "Guest": "النزيل", "Room": "الغرفة",
      "Total": "الإجمالي", "Payment": "الدفع", "Actions": "الإجراءات",
      "View": "عرض", "Confirm": "تأكيد", "Cancel Booking": "إلغاء الحجز",
      "Check In": "تسجيل الدخول", "Check Out": "تسجيل الخروج",
      "Booking Details": "تفاصيل الحجز", "No bookings found": "لا توجد حجوزات",
      "Loading bookings…": "جارٍ تحميل الحجوزات…",       "Could not load bookings": "تعذّر تحميل الحجوزات",
      "Not authorized": "غير مصرح", "Admin claim required": "يتطلب صلاحية المدير",
      "Booked updated": "تم تحديث الحجز", "Already": "بالفعل", "Confirmed": "مؤكد",
      "Checked In": "سجّل دخوله", "Checked Out": "سجّل خروجه", "Unpaid": "غير مدفوع",
      "Paid": "مدفوع", "Pending": "قيد الانتظار", "Failed": "فشل", "Refunded": "مُسترد",
      "Cancelled": "ملغى", "Email": "البريد", "Phone": "الهاتف", "Adults": "بالغون",
      "Children": "أطفال", "Rooms": "غرف", "Nights": "ليالٍ", "Created": "أُنشئ",
      "Mark Pending": "تحديد قيد الانتظار", "Mark Paid": "تحديد مدفوع",
      "Mark Failed": "تحديد فشل", "Mark Refunded": "تحديد مُسترد", "Payment:": "الدفع:"
    }
  };
  // Reverse lookup: English -> key for AR column headers built from field labels
  function tr(str) {
    const l = (window.MGLang && window.MGLang.get && window.MGLang.get()) || "en";
    if (l === "ar" && DI18N.ar[str] != null) return DI18N.ar[str];
    return str;
  }
  // Swap visible header/button text inside a freshly rendered view.
  function localizeView(view) {
    const l = (window.MGLang && window.MGLang.get && window.MGLang.get()) || "en";
    if (l !== "ar") return;
    view.querySelectorAll("h1,h3,th,button,.dash-stat__label,.dash-login__sub,.dash-note").forEach(n => {
      const key = n.textContent.trim();
      if (DI18N.ar[key] != null) n.textContent = DI18N.ar[key];
    });
  }

  /* ---------------- Auth ---------------- */
  // Verify the signed-in user holds the `admin` custom claim.
  // Returns the claims object; throws "not_admin" otherwise.
  async function assertAdmin() {
    if (!FB || !FB.idTokenClaims) throw new Error("not_authed");
    const res = await FB.idTokenClaims(false);
    if (!res || !res.claims || res.claims.admin !== true) throw new Error("not_admin");
    return res.claims;
  }

  async function attemptLogin(email, pass) {
    await ready();
    if (Data.mode === "firebase" && FB) {
      await FB.signIn(email, pass);              // throws on bad creds
      // Authorization (defense-in-depth, NOT relying on rules alone):
      // a signed-in user MUST hold the admin claim to use the dashboard.
      try { await assertAdmin(); }
      catch (e) {
        await FB.signOut().catch(() => {});
        sessionStorage.removeItem("mg-auth");
        throw new Error("Not authorized — admin access required.");
      }
      sessionStorage.setItem("mg-auth", "fb");
      return true;
    }
    if (email && pass) { sessionStorage.setItem("mg-auth", "demo"); return true; }
    throw new Error("Credentials required");
  }

  // Render a clear "not authorized" state (authed but no admin claim).
  function renderNotAuthorized() {
    const app = document.getElementById("dash");
    if (!app) return;
    app.className = "";
    app.innerHTML = `<div class="dash-login"><div class="dash-login__card">
      <div class="dash-brand">Marshal<span>Al-Gezira</span></div>
      <p class="dash-login__sub" style="color:#f0a3a3">${tr("Not authorized")}</p>
      <p class="dash-note">${tr("Admin claim required")}</p>
      <button type="button" class="btn btn--outline btn--block" id="naLogout">${tr("Logout")}</button>
    </div></div>`;
    const b = document.getElementById("naLogout");
    if (b) b.addEventListener("click", logout);
  }

  /* ---------------- Sections registry ---------------- */
  let currentSection = "home";
  // Admin authorization flag, derived from the Firebase custom claim
  // (claims.admin === true). Mutation UI is hidden unless true.
  let adminOk = false;
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

  function buildShell() {
    const app = $("#dash");
    app.className = "dash";
    app.innerHTML = `
      <aside class="dash-side" id="dashSide">
        <div class="dash-brand">Marshal<span>Al-Gezira</span></div>
        <nav class="dash-nav">
          ${SECTIONS.map(s => `<button class="dash-link" data-section="${s.id}"><span>${s.icon}</span><span data-i18n="${s.i18n}">${s.label}</span></button>`).join("")}
        </nav>
        <button class="dash-link dash-logout" id="dashLogout"><span>⏻</span><span data-i18n="d_logout">Logout</span></button>
      </aside>
      <div class="dash-scrim" id="dashScrim"></div>
      <main class="dash-main">
        <header class="dash-top">
          <button class="dash-menu-btn" id="dashMenuBtn" aria-label="Menu">&#9776;</button>
          <h1 id="dashTitle">Dashboard</h1>
          <div class="dash-user">
            <button class="dash-lang" id="dashLangToggle">ع / EN</button>
            <span id="dashMode" class="dash-pill">demo</span>
            <span id="dashEmail">admin</span>
          </div>
        </header>
        <div id="dashView" class="dash-view"></div>
      </main>`;
    $$(".dash-link[data-section]").forEach(b => b.addEventListener("click", () => { showSection(b.dataset.section); closeSidebar(); }));
    $("#dashLogout").addEventListener("click", logout);
    const lt = $("#dashLangToggle");
    if (lt && window.MGLang) lt.addEventListener("click", () => window.MGLang.apply(window.MGLang.get() === "ar" ? "en" : "ar"));
    const mb = $("#dashMenuBtn"), scrim = $("#dashScrim");
    if (mb) mb.addEventListener("click", () => { $("#dashSide").classList.toggle("open"); if (scrim) scrim.classList.toggle("show", $("#dashSide").classList.contains("open")); });
    if (scrim) scrim.addEventListener("click", closeSidebar);
    if (window.MGLang) window.MGLang.retranslate();
  }
  function closeSidebar() { const s = $("#dashSide"); if (s) s.classList.remove("open"); const sc = $("#dashScrim"); if (sc) sc.classList.remove("show"); }

  async function showSection(id) {
    $$(".dash-link[data-section]").forEach(b => b.classList.toggle("active", b.dataset.section === id));
    const view = $("#dashView");
    const titles = Object.fromEntries(SECTIONS.map(s => [s.id, s.label]));
    if ($("#dashTitle")) $("#dashTitle").textContent = tr(titles[id] || "Dashboard");
    view.innerHTML = `<div class="dash-loading">${tr("Loading…")}</div>`;
    if (id === "home") return renderHome(view);
    if (id === "rooms") return renderCrud(view, "rooms", {
      cols: ["name", "type", "price", "size", "featured"], media: false,
      fields: [
        { k: "name", label: "Name", type: "text" },
        { k: "type", label: "Type", type: "text" },
        { k: "price", label: "Price / night", type: "number" },
        { k: "size", label: "Size", type: "text" },
        { k: "desc", label: "Description", type: "textarea" },
        { k: "amenities", label: "Amenities (comma)", type: "text" },
        { k: "image", label: "Image", type: "image" },
        { k: "featured", label: "Featured", type: "checkbox" }
      ]
    });
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
    if (id === "reviews") return renderCrud(view, "reviews", {
      cols: ["author", "rating", "text", "status"],
      fields: [
        { k: "author", label: "Author", type: "text" },
        { k: "rating", label: "Rating (1-5)", type: "number" },
        { k: "text", label: "Review", type: "textarea" },
        { k: "status", label: "Status", type: "select", options: ["Pending", "Published", "Hidden"] }
      ]
    });
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
        { k: "desc", label: "Description", type: "textarea" }
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
    const totalRev = bookings.reduce((s, b) => s + (Number(b.revenue) || 0), 0);
    const confirmed = bookings.filter(b => b.status === "Confirmed").length;
    const pending = bookings.filter(b => b.status === "Pending").length;
    const occupancy = rooms.length ? Math.round((confirmed / rooms.length) * 100) : 0;

    // Status donut
    const statusCounts = { Confirmed: confirmed, Pending: pending, Cancelled: bookings.filter(b => b.status === "Cancelled").length };
    const donut = donutSVG(statusCounts);

    // Revenue trend (last 6 months mock from bookings)
    const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
    const trend = months.map((_, i) => Math.round(totalRev / 6 * (0.7 + 0.12 * i)));
    const line = lineSVG(trend, months);

    view.innerHTML = `
      <div class="dash-cards">
        ${statCard("Rooms", rooms.length)}
        ${statCard("Bookings", bookings.length)}
        ${statCard("Customers", customers.length)}
        ${statCard("Reviews", reviews.length)}
      </div>
      <div class="dash-cards">
        ${statCard("Confirmed", confirmed)}
        ${statCard("Pending", pending)}
        ${statCard("Occupancy", occupancy + "%")}
        ${statCard("Revenue", money(totalRev))}
      </div>
      <div class="dash-grid-2">
        <div class="dash-panel">
          <h3>Revenue Trend</h3>
          ${line}
        </div>
        <div class="dash-panel">
          <h3>Booking Status</h3>
          <div class="dash-donut">${donut}<div class="dash-donut__legend">
            <span><i style="background:#22c55e"></i>Confirmed ${confirmed}</span>
            <span><i style="background:#eab308"></i>Pending ${pending}</span>
            <span><i style="background:#ef4444"></i>Cancelled ${statusCounts.Cancelled}</span>
          </div></div>
        </div>
      </div>
      <div class="dash-panel">
        <h3>Recent Bookings</h3>
        <div class="table-wrap">
          <table class="dash-table">
            <thead><tr><th>Guest</th><th>Room</th><th>Check-in</th><th>Revenue</th><th>Status</th></tr></thead>
            <tbody>
              ${bookings.slice(0, 6).map(b => `<tr><td>${esc(b.guest)}</td><td>${esc(b.room)}</td><td>${esc(b.checkin)}</td><td>${money(b.revenue)}</td><td><span class="tag tag-${b.status}">${esc(b.status)}</span></td></tr>`).join("") || `<tr><td colspan="5">No bookings</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
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
  const BOOKING_STATUSES = ["Pending", "Confirmed", "Checked In", "Checked Out", "Cancelled"];
  const PAYMENT_STATUSES = ["Unpaid", "Pending", "Paid", "Failed", "Refunded"];

  // Allowed forward transitions. Cancelled / Checked Out are terminal.
  function nextActions(status) {
    switch (status) {
      case "Pending":    return ["confirm", "cancel"];
      case "Confirmed":  return ["checkin", "cancel"];
      case "Checked In": return ["checkout"];
      case "Checked Out":return [];
      case "Cancelled":  return [];
      default:           return [];
    }
  }
  const ACTION_LABEL = { confirm: "Confirm", cancel: "Cancel Booking", checkin: "Check In", checkout: "Check Out" };
  // Payment status transitions (INDEPENDENT of booking status).
  // Unpaid -> Pending / Paid ; Pending -> Paid / Failed ; Paid -> Refunded.
  // Cancelled bookings can be refunded (Unpaid/Pending -> Refunded).
  // Failed & Refunded are terminal. Never auto-mark Paid without a real
  // payment confirmation (enforced by design: admin does it manually).
  function nextPaymentActions(payment) {
    switch (payment || "Unpaid") {
      case "Unpaid":  return ["pay_pending", "pay_paid", "pay_refunded"];
      case "Pending": return ["pay_paid", "pay_failed", "pay_refunded"];
      case "Paid":    return ["pay_refunded"];
      case "Cancelled":return [];   // booking-level; payment still refundable below
      case "Failed":  return [];
      case "Refunded":return [];
      default:        return [];
    }
  }
  // Allow a refunded payment regardless of booking status (e.g. Cancelled/Refunded).
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
    const map = { "Checked In": "CheckedIn", "Checked Out": "CheckedOut" };
    const cls = "tag tag-" + (map[s] || s);
    return `<span class="${cls}">${esc(s)}</span>`;
  }
  function payTag(p) {
    const cls = "tag tag-" + (p === "Paid" ? "Paid" : p === "Unpaid" ? "Unpaid" : p);
    return `<span class="${cls}">${esc(p || "Unpaid")}</span>`;
  }
  const STATUS_KEY = {
    "Pending": "Pending", "Confirmed": "Confirmed", "Checked In": "Checked In",
    "Checked Out": "Checked Out", "Cancelled": "Cancelled"
  };
  const PAY_KEY = {
    "Unpaid": "Unpaid", "Pending": "Pending", "Paid": "Paid", "Failed": "Failed", "Refunded": "Refunded"
  };

  async function renderBookings(view) {
    // Filter state (persists across re-renders within this view).
    const state = {
      q: "", status: "all", payment: "all",
      cinFrom: "", coutTo: ""
    };

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
        <div class="table-wrap"><table class="dash-table">
          <thead><tr><th>${tr("Reference")}</th><th>${tr("Guest")}</th><th>${tr("Room")}</th><th>${tr("Check-in")}</th><th>${tr("Check-out")}</th><th>${tr("Guests")}</th><th>${tr("Total")}</th><th>${tr("Status")}</th><th>${tr("Payment")}</th><th>${tr("Actions")}</th></tr></thead>
          <tbody id="bkTbody"></tbody>
        </table></div>
      </div>

      <div class="dash-modal" id="bkModal" hidden>
        <div class="dash-modal__box">
          <h3 id="bkModalTitle">${tr("Booking Details")}</h3>
          <div id="bkModalBody"></div>
          <div class="dash-modal__actions" id="bkModalActions"></div>
          <div class="dash-form__actions" style="margin-top:18px"><button type="button" class="btn-mini" id="bkModalClose">${tr("Cancel")}</button></div>
        </div>
      </div>`;

    const tbody = $("#bkTbody", view);
    const states = $("#bkStates", view);
    const modal = $("#bkModal", view);
    const modalBody = $("#bkModalBody", view);
    const modalActions = $("#bkModalActions", view);

    async function load() {
      states.innerHTML = `<div class="dash-loading">${tr("Loading bookings…")}</div>`;
      tbody.innerHTML = "";
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
        states.innerHTML = `<div class="dash-loading">${tr("No bookings found")}</div>`;
        return;
      }

      tbody.innerHTML = filtered.map(b => {
        const actions = nextActions(b.status || "Pending");
        const payActions = nextPaymentActionsForBooking(b.paymentStatus, b.status || "Pending");
        // Mutation controls are admin-claim gated (defense-in-depth).
        // Non-admins see only the read-only "View" action.
        const btns = `<button class="btn-mini" data-view="${b.id}">${tr("View")}</button>` +
          (adminOk
            ? actions.map(a => `<button class="btn-mini ${a === "cancel" ? "danger" : "btn--gold"}" data-act="${a}" data-id="${b.id}">${tr(ACTION_LABEL[a])}</button>`).join("") +
              (payActions.length ? `<span class="bk-sep"></span>` + payActions.map(a => `<button class="btn-mini" data-pay="${a}" data-id="${b.id}">${tr(PAY_ACTION_LABEL[a])}</button>`).join("") : "")
            : "");
        return `<tr>
          <td>${esc(b.id)}</td>
          <td>${esc(b.guestName || b.guest || "")}</td>
          <td>${esc(b.roomName || b.room || "")}</td>
          <td>${esc(b.checkin || "")}</td>
          <td>${esc(b.checkout || "")}</td>
          <td>${esc(b.guests != null ? b.guests : ((b.adults || 0) + (b.children || 0)))}</td>
          <td>${money(b.total != null ? b.total : b.revenue)}</td>
          <td>${statusTag(b.status || "Pending")}</td>
          <td>${payTag(b.paymentStatus)}</td>
          <td class="dash-actions">${btns}</td>
        </tr>`;
      }).join("");
    }

    function statusUpdate(id, patch, okMsg) {
      return async () => {
        try {
          await Data.update("bookings", id, patch);
          toast(tr(okMsg));
          modal.hidden = true;
          await load();
        } catch (e) { toast("Error: " + e.message, "err"); }
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
        ${row("Total", money(b.total != null ? b.total : b.revenue))}
        ${row("Status", b.status || "Pending")}
        ${row("Payment", b.paymentStatus || "Unpaid")}
        ${row("Created", b.created)}
      </dl>`;
      const actions = nextActions(b.status || "Pending");
      const payActions = nextPaymentActionsForBooking(b.paymentStatus, b.status || "Pending");
      // Mutation controls are admin-claim gated; non-admins get a
      // read-only details view (no status/payment change buttons).
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

    // Filter bindings
    $("#bkSearchInput", view).addEventListener("input", e => { state.q = e.target.value; load(); });
    $("#bkStatusFilter", view).addEventListener("change", e => { state.status = e.target.value; load(); });
    $("#bkPayFilter", view).addEventListener("change", e => { state.payment = e.target.value; load(); });
    $("#bkCinFrom", view).addEventListener("change", e => { state.cinFrom = e.target.value; load(); });
    $("#bkCoutTo", view).addEventListener("change", e => { state.coutTo = e.target.value; load(); });

    // Row actions (event-delegated)
    tbody.addEventListener("click", async (e) => {
      const viewBtn = e.target.closest("[data-view]");
      if (viewBtn) {
        const id = viewBtn.dataset.view;
        const b = (await Data.list("bookings")).find(x => x.id === id);
        if (b) openDetails(b);
        return;
      }
      const actBtn = e.target.closest("[data-act]");
      if (actBtn) {
        const id = actBtn.dataset.id, a = actBtn.dataset.act;
        let patch = {};
        if (a === "confirm") patch = { status: "Confirmed" };
        else if (a === "cancel") patch = { status: "Cancelled" };
        else if (a === "checkin") patch = { status: "Checked In" };
        else if (a === "checkout") patch = { status: "Checked Out" };
        await statusUpdate(id, patch, "Booked updated")();
      }
      const payBtn = e.target.closest("[data-pay]");
      if (payBtn) {
        const id = payBtn.dataset.id, a = payBtn.dataset.pay;
        await statusUpdate(id, { paymentStatus: PAY_TO_STATUS[a] }, "Booked updated")();
      }
    });

    $("#bkModalClose", view).addEventListener("click", () => modal.hidden = true);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });

    localizeView(view);
    currentSection = "bookings";
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
          if (cfg.media && c === "url") return `<td><img src="${esc(v)}" class="dash-thumb" alt=""></td>`;
          return `<td>${esc(v)}</td>`;
        }).join("")}
        <td class="dash-actions">
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
        <div class="table-wrap">
          <table class="dash-table">
            <thead><tr>${cfg.cols.map(c => `<th>${tr(c.charAt(0).toUpperCase() + c)}</th>`).join("")}<th>${tr("Actions")}</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="${cfg.cols.length + 1}">${tr("No records")}</td></tr>`}</tbody>
          </table>
        </div>
      </div>
      <div class="dash-modal" id="modal" hidden>
        <div class="dash-modal__box">
          <h3 id="modalTitle">Add</h3>
          <form id="modalForm" class="dash-form">
            ${cfg.fields.map(f => fieldHtml(f)).join("")}
            <div class="dash-form__actions">
              <button type="button" class="btn-mini" id="cancelBtn">Cancel</button>
              <button type="submit" class="btn btn--gold btn--sm">Save</button>
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
        else if (Array.isArray(val)) input.value = val.join(", ");
        else input.value = val == null ? "" : val;
        if (f.type === "image" && item && item[f.k]) {
          const pv = wrap.querySelector(".img-prev");
          if (pv) { pv.src = item[f.k]; pv.style.display = "block"; }
        }
      });
      modal.dataset.editId = item ? item.id : "";
      modal.hidden = false;
    };
    $("#addBtn").addEventListener("click", () => { if (!adminOk) return; openModal(null); });
    $("#cancelBtn").addEventListener("click", () => modal.hidden = true);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });

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
      if (!adminOk) return; // admin-claim gated mutation
      const item = {};
      for (const f of cfg.fields) {
        const wrap = $(`[data-field="${f.k}"]`, modal);
        const input = wrap.querySelector("input, textarea, select");
        let val;
        if (f.type === "checkbox") val = input.checked;
        else if (f.type === "number") val = Number(input.value);
        else if (f.type === "image") {
          if (input.files && input.files[0]) {
            const url = await Data.uploadImage(input.files[0], col);
            val = url || (input.dataset.existing || "");
          } else val = input.dataset.existing || "";
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
      <input type="file" name="${f.k}" accept="image/*">
      <img class="img-prev" alt="" style="display:none;max-width:120px;border-radius:8px;margin-top:8px">
      <input type="hidden" class="img-existing" data-existing="">
      <small class="dash-hint">${tr("Upload an image (Firebase Storage) or keep the current URL.")}</small>
    </label>`;
    return `<label ${attrs}>${lbl}<input type="${f.type}" name="${f.k}" ${f.type === "number" ? 'step="any"' : ''}></label>`;
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
      await Data.set("hotel", obj); toast(tr("Hotel info saved"));
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
        <div class="dash-note">${tr("Mode:")} <b id="modeNote">${(Data.mode || "demo")}</b>. ${tr("Set your Firebase keys in")} <code>js/firebase-config.js</code> ${tr("to enable cloud sync, auth & image storage.")}</div>
        <div class="dash-seed">
          <button type="button" class="btn btn--outline btn--sm" id="seedCloudBtn">${tr("Seed cloud data")}</button>
          <span class="dash-seed__hint" id="seedHint"></span>
        </div>
      </div>`;
    $("#setForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!adminOk) return;
      const fd = new FormData(e.target); const obj = {}; fd.forEach((v, k) => obj[k] = v);
      await Data.set("settings", obj); toast(tr("Settings saved"));
    });
    const seedBtn = $("#seedCloudBtn");
    if (seedBtn) seedBtn.addEventListener("click", async () => {
      const hint = $("#seedHint");
      if (!window.MGSeedCloud) { hint.textContent = "Seeder not loaded."; return; }
      if (!window.MGFirebaseServices || !window.MGFirebaseServices.isLive()) {
        hint.textContent = tr("Sign in with Firebase first (live mode).");
        return;
      }
      hint.textContent = tr("Seeding…");
      try { await window.MGSeedCloud(); hint.textContent = tr("Cloud data seeded ✓"); toast(tr("Cloud data seeded")); }
      catch (err) { hint.textContent = err.message; }
    });
  }

  /* ---------------- Login + shell ---------------- */
  function renderLogin() {
    const app = $("#dash");
    app.className = "";
    app.innerHTML = `
      <div class="dash-login">
        <div class="dash-login__card">
          <div class="dash-brand">Marshal<span>Al-Gezira</span></div>
          <p class="dash-login__sub">${tr("Admin Console")}</p>
          <form id="loginForm" class="dash-form">
            <label>${tr("Email")}<input type="email" name="email" required placeholder="admin@hotel.com"></label>
            <label>${tr("Password")}<input type="password" name="pass" required placeholder="••••••••"></label>
            <button type="submit" class="btn btn--gold btn--block">${tr("Sign In")}</button>
            <p class="dash-login__hint" id="loginHint"></p>
          </form>
        </div>
      </div>`;
    $("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const email = f.querySelector('[name="email"]').value;
      const pass = f.querySelector('[name="pass"]').value;
      try {
        await attemptLogin(email, pass);
        const m = await ready(); Data.mode = m;
        $("#dashMode") && ($("#dashMode").textContent = m);
        bootDashboard();
      } catch (err) {
        $("#loginHint").textContent = tr("Login failed:") + " " + err.message;
      }
    });
  }

  async function logout() {
    if (Data.mode === "firebase" && FB) { try { await FB.signOut(); } catch (e) {} }
    sessionStorage.removeItem("mg-auth");
    renderLogin();
  }

  async function bootDashboard() {
    buildShell();
    const m = await ready(); Data.mode = m;
    // Confirm admin claim at boot (defense-in-depth even if boot was
    // reached via a stale session). Non-admin -> not-authorized.
    let ok = true;
    if (m === "firebase" && FB) {
      try { await assertAdmin(); adminOk = true; }
      catch (e) { ok = false; }
    } else { adminOk = true; } // demo mode: no real auth
    if (!ok) { renderNotAuthorized(); return; }

    const modeEl = $("#dashMode");
    if (modeEl) modeEl.textContent = m + (m === "demo" ? " (no keys)" : "");
    const authEl = $("#dashEmail");
    if (authEl && window.MGFirebase && window.MGFirebase.ready && FB && FB.auth && FB.auth.currentUser) {
      authEl.textContent = FB.auth.currentUser.email || "admin";
    }
    showSection("home");
    if (window.MGLang) document.addEventListener("lang:change", () => { if (currentSection) showSection(currentSection); });
  }

  function initDash() {
    if (!document.getElementById("dash")) return;
    // Production error: config present but SDK failed. Do NOT fall back to
    // demo; show a clear fatal message so it is never silently shipped.
    if (window.MGFirebase && window.MGFirebase.fatal) {
      const app = document.getElementById("dash");
      app.className = "";
      app.innerHTML = `<div class="dash-login"><div class="dash-login__card">
        <div class="dash-brand">Marshal<span>Al-Gezira</span></div>
        <p class="dash-login__sub" style="color:#f0a3a3">Configuration error</p>
        <p class="dash-note">${esc(window.MGFirebase.message || "Firebase failed to initialize.")}</p>
      </div></div>`;
      return;
    }
    // Resumed session (sessionStorage) — still verify the admin claim
    // before rendering any mutation UI. Non-admin -> not-authorized.
    if (sessionStorage.getItem("mg-auth")) {
      if (window.MGFirebase && window.MGFirebase.ready === true) {
        // Ensure FB handle is bound (boot may have finished already).
        if (!FB) FB = window.MGFirebase;
        assertAdmin().then(() => bootDashboard()).catch(() => renderNotAuthorized());
        return;
      }
      if (window.MGFirebase && window.MGFirebase.ready === false && !window.MGFirebase.fatal) {
        // Firebase still booting in live mode — wait for readiness.
        document.addEventListener("firebase:ready", () => {
          if (window.MGFirebase.ready === true) {
            FB = window.MGFirebase;
            assertAdmin().then(() => bootDashboard()).catch(() => renderNotAuthorized());
          } else { bootDashboard(); }
        }, { once: true });
        return;
      }
      // Demo mode resume (no real auth).
      bootDashboard();
      return;
    }
    if (window.MGFirebase && window.MGFirebase.ready && window.MGFirebase.auth) {
      // Render login optimistically; Firebase auth state may take a moment.
      renderLogin();
      let resolved = false;
      const guard = setTimeout(() => { if (!resolved) bootDashboardIfAuthed(); }, 1500);
      window.MGFirebase.onAuth(u => {
        resolved = true; clearTimeout(guard);
        if (u) {
          // Auto-boot only after confirming the admin claim.
          assertAdmin().then(() => bootDashboard()).catch(() => renderNotAuthorized());
        } /* else keep login form */
      });
    } else { renderLogin(); }
  }
  function bootDashboardIfAuthed() {
    if (window.MGFirebase && window.MGFirebase.auth && window.MGFirebase.auth.currentUser) bootDashboard();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initDash);
  else initDash();
})();
