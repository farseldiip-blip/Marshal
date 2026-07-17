/* =========================================================
   firebase.js — Firebase v10 modular init + data layer
   PASTE YOUR PROJECT CONFIG below (firebaseConfig).
   Requires: Firestore + Storage + Authentication (Email/Password).
   ========================================================= */
(function () {
  "use strict";

  // ===== TODO: Replace with your Firebase project config =====
  const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
  };
  // ==========================================================

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

      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);
      const storage = getStorage(app);
      const auth = getAuth(app);

      // Expose API
      window.MGFirebase = {
        ready: true, auth, db, storage,
        fns: { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp },
        storageFns: { ref, uploadBytes, getDownloadURL, deleteObject },
        signIn: (e, p) => signInWithEmailAndPassword(auth, e, p),
        signUp: (e, p) => createUserWithEmailAndPassword(auth, e, p),
        signOut: () => signOut(auth),
        onAuth: (cb) => onAuthStateChanged(auth, cb)
      };
      document.dispatchEvent(new CustomEvent("firebase:ready"));
    } catch (err) {
      console.error("[firebase] init failed:", err);
      window.MGFirebase = { ready: false, error: err };
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
