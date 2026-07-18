# Admin Bootstrap (first admin)

The dashboard ONLY renders mutation controls when the signed-in
Firebase user holds the custom claim `admin === true`. This is enforced
both client-side (defense-in-depth) and by Firestore/Storage rules.

## First-admin seeding (one-time, server-authorized)

1. Create the admin's Firebase Authentication account
   (Email/Password) in the Firebase Console, OR register via the
   dashboard sign-up (if enabled).
2. Set `ADMIN_EMAILS` (comma-separated) in the Cloud Functions
   environment / secret manager to include that email, e.g.
   `ADMIN_EMAILS=admin@marshalhotel.com`.
3. From a trusted context (Admin SDK script, or a temporary
   authenticated call), invoke the `setAdminClaim` callable with
   `{ "email": "admin@marshalhotel.com" }`.
   - Because the caller's own email is in `ADMIN_EMAILS`, the
     self-grant is permitted (allowlist path).
   - An already-admin may grant to ANY email (promotion-by-admin).
4. After the call returns `{ "ok": true, "uid": "..." }`, the
   client MUST force-refresh the ID token:
   `await firebase.auth().currentUser.getIdToken(true)`
   (exposed as `window.MGFirebase.refreshToken()`), then
   `getIdTokenResult()` will show `claims.admin === true` and the
   dashboard unlocks.

## Security guarantees

- A normal public user CANNOT self-promote: their email is not in
  `ADMIN_EMAILS` and they are not an admin, so `setAdminClaim`
  returns `permission-denied`.
- Only emails in `ADMIN_EMAILS` may self-grant the FIRST claim.
  After that, only an existing admin may grant further claims.
- Firestore rules independently require `isAdmin()` for any write,
  so even a mis-granted client cannot mutate data without the claim.

## Deploy steps

    cd functions
    npm install
    cd ..
    firebase deploy --only functions

Set function env vars / secrets (never commit):
    PAYMENT_PROVIDER=paymob
    PAYMOB_API_KEY=...
    PAYMOB_HMAC_SECRET=...
    PAYMOB_INTEGRATION_ID=...
    PAYMOB_IFRAME_ID=...
    PAYMOB_BASE_URL=https://accept.paymob.com
    ADMIN_EMAILS=admin@marshalhotel.com
