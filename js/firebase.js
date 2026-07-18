/* =========================================================
   firebase.js — Firebase v10 modular init + data layer
   Reads its config from js/firebase-config.js (window.MGFirebaseConfig).
   Requires: Firestore + Storage + Authentication (Email/Password).
   ========================================================= */
(function () {
  "use strict";

  // Config lives in firebase-config.js so it stays editable without
  // touching this logic. Falls back to placeholder if not present.
  const firebaseConfig = (window.MGFirebaseConfig && window.MGFirebaseConfig.apiKey &&
                          window.MGFirebaseConfig.apiKey !== "YOUR_API_KEY")
    ? window.MGFirebaseConfig
    : { apiKey: "YOUR_API_KEY" };

  async function boot() {
    try {
      const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
      const { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
              updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp } =
              await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      const { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } =
              await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js");
      const { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } =
              await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
      const { getFunctions, httpsCallable } =
              await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js");

      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);
      const storage = getStorage(app);
      const auth = getAuth(app);
      const fns = getFunctions(app);

      // Expose API
      window.MGFirebase = {
        ready: true, auth, db, storage,
        fns: { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp },
        storageFns: { ref, uploadBytes, getDownloadURL, deleteObject },
        signIn: (e, p) => signInWithEmailAndPassword(auth, e, p),
        signUp: (e, p) => createUserWithEmailAndPassword(auth, e, p),
        signOut: () => signOut(auth),
        onAuth: (cb) => onAuthStateChanged(auth, cb),
        // Returns the decoded ID-token claims (e.g. { admin: true }).
        // forceRefresh=true re-reads after a claim change (setAdminClaim).
        idTokenClaims: (force) => auth.currentUser.getIdTokenResult(!!force),
        refreshToken: () => auth.currentUser.getIdToken(true),
        // Call a deployed Cloud Function (e.g. createBooking, setAdminClaim).
        callFunction: (name, data) => httpsCallable(fns, name)(data).then(r => r.data)
      };
      document.dispatchEvent(new CustomEvent("firebase:ready"));
    } catch (err) {
      // Config was present (we only call boot() when apiKey is real), so a
      // failure here is a PRODUCTION error — do NOT silently fall back to
      // demo mode. Surface a clear, actionable error instead.
      console.error("[firebase] PRODUCTION ERROR: SDK failed to load with valid config.", err);
      window.MGFirebase = {
        ready: false,
        fatal: true,
        error: err,
        message: "Firebase SDK failed to initialize despite valid configuration. " +
                 "Check network/CDN access and the import URLs in firebase.js. " +
                 "The app will NOT fall back to demo mode when a real config is set."
      };
      document.dispatchEvent(new CustomEvent("firebase:ready"));
    }
  }

  // Don't even load SDK if config is still placeholder
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    boot();
  } else {
    console.warn("[firebase] Config not set — dashboard runs in offline/demo mode.");
    window.MGFirebase = { ready: false, demo: true };
    document.dispatchEvent(new CustomEvent("firebase:ready"));
  }
})();
