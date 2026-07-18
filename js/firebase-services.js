/* =========================================================
   firebase-services.js — Reusable Firebase service layer.
   ---------------------------------------------------------
   Thin, promise-based helpers on top of the global
   window.MGFirebase API (initialized by firebase.js).

   DESIGN RULES (Phase 1):
   - Does NOT change any existing UI or functionality.
   - Is a NO-OP / safe in demo mode (when MGFirebase.ready
     is false). Callers should keep using the dashboard's
     Data facade, which already routes to Firebase or demo.
   - Only exposes helpers; it does not auto-run anything.
   - Safe to load before firebase.js finishes booting; every
     helper awaits readiness internally.

   Collection names used across the app (keep in sync with
   js/dashboard.js seed()): rooms, bookings, customers, reviews,
   gallery, menu, amenities, hotel, settings.
   ========================================================= */
(function () {
  "use strict";

  const FB = () => window.MGFirebase || null;

  // Wait until firebase.js has dispatched firebase:ready.
  function whenReady() {
    return new Promise((resolve) => {
      const mg = FB();
      if (mg && (mg.ready === true || mg.ready === false)) return resolve(mg);
      document.addEventListener("firebase:ready", () => resolve(FB()), { once: true });
      // Fallback in case the event was missed
      const t = setInterval(() => {
        const m = FB();
        if (m && (m.ready === true || m.ready === false)) { clearInterval(t); resolve(m); }
      }, 100);
      setTimeout(() => { clearInterval(t); resolve(FB()); }, 8000);
    });
  }

  const Services = {
    isLive: () => !!(FB() && FB().ready === true),

    /* ---------- Auth ---------- */
    async signIn(email, password) {
      const mg = await whenReady();
      if (!mg || !mg.ready) throw new Error("Firebase not configured (demo mode)");
      return mg.signIn(email, password);
    },
    async signUp(email, password) {
      const mg = await whenReady();
      if (!mg || !mg.ready) throw new Error("Firebase not configured (demo mode)");
      return mg.signUp(email, password);
    },
    async signOut() {
      const mg = await whenReady();
      if (mg && mg.ready && mg.signOut) return mg.signOut();
    },
    onAuth(cb) {
      const mg = FB();
      if (mg && mg.ready && mg.onAuth) return mg.onAuth(cb);
      // Demo mode: never authed
      return () => {};
    },
    currentUser() {
      const mg = FB();
      return (mg && mg.ready && mg.auth && mg.auth.currentUser) || null;
    },

    /* ---------- Firestore ---------- */
    async list(collection) {
      const mg = await whenReady();
      if (!mg || !mg.ready) return null; // signal "use demo"
      const { getDocs, collection: col, query, orderBy } = mg.fns;
      const snap = await getDocs(query(col(mg.db, collection), orderBy("__order", "desc")));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async add(collection, data) {
      const mg = await whenReady();
      if (!mg || !mg.ready) return null;
      const { addDoc, collection: col, serverTimestamp } = mg.fns;
      const ref = await addDoc(col(mg.db, collection), { ...data, __order: Date.now(), updatedAt: serverTimestamp() });
      return { ...data, id: ref.id };
    },
    async update(collection, id, patch) {
      const mg = await whenReady();
      if (!mg || !mg.ready) return null;
      const { doc, updateDoc, serverTimestamp } = mg.fns;
      await updateDoc(doc(mg.db, collection, id), { ...patch, updatedAt: serverTimestamp() });
    },
    async remove(collection, id) {
      const mg = await whenReady();
      if (!mg || !mg.ready) return null;
      const { doc, deleteDoc } = mg.fns;
      await deleteDoc(doc(mg.db, collection, id));
    },
    async setDoc(collection, data) {
      const mg = await whenReady();
      if (!mg || !mg.ready) return null;
      const { doc, setDoc: set, serverTimestamp } = mg.fns;
      await set(doc(mg.db, collection, "info"), { ...data, updatedAt: serverTimestamp() });
    },
    async getDoc(collection) {
      const mg = await whenReady();
      if (!mg || !mg.ready) return null;
      const { doc, getDoc: get } = mg.fns;
      const snap = await get(doc(mg.db, collection, "info"));
      return snap.exists() ? snap.data() : null;
    },
    // Fetch a single document by id (used to read the server-stamped
    // accessToken right after creation). No security impact: read-only.
    async getById(collection, id) {
      const mg = await whenReady();
      if (!mg || !mg.ready) return null;
      const { doc, getDoc: get } = mg.fns;
      const snap = await get(doc(mg.db, collection, id));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },

    /* ---------- Storage ---------- */
    async uploadImage(file, path) {
      const mg = await whenReady();
      if (!mg || !mg.ready || !mg.storage) return null; // demo keeps existing URL
      const { ref, uploadBytes, getDownloadURL } = mg.storageFns;
      const r = ref(mg.storage, path + "/" + Date.now() + "_" + file.name.replace(/\s+/g, "_"));
      await uploadBytes(r, file);
      return getDownloadURL(r);
    }
  };

  window.MGFirebaseServices = Services;
})();
