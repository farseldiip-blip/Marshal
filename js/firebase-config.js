/* =========================================================
   firebase-config.js — SINGLE SOURCE OF TRUTH for Firebase.
   ---------------------------------------------------------
   HOW TO USE:
   1. Create a project at https://console.firebase.google.com
   2. Add a Web App (</>), copy its config.
   3. Paste the values below.
   4. In the Firebase Console enable:
        - Authentication → Sign-in method → Email/Password
        - Firestore Database (Production mode)
        - Storage
   5. Replace the placeholder below. Until then the app stays
      in offline/demo mode (localStorage) — nothing breaks.

   IMPORTANT: keep this file out of any public secret-leak
   concerns; these are public client-side Firebase keys by
   design (security is handled by Firestore Rules + Storage
   Rules, configured separately).
   ========================================================= */
window.MGFirebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
