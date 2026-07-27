/* =========================================================
   src/middleware/auth.js — JWT auth + role guard.
   ---------------------------------------------------------
   SECURITY:
   - Validates JWT signature + expiration + issuer.
   - Returns 401 for invalid/expired tokens (never 500).
   - Logs unauthorized admin access attempts.
   ========================================================= */
const jwt = require("jsonwebtoken");
const ENV = require("../config/env");
const { ForbiddenError, UnauthorizedError } = require("../utils/errors");

function extractToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

// Require a valid JWT (any authenticated user).
function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next(new UnauthorizedError("missing_token"));
  try {
    req.user = jwt.verify(token, ENV.JWT_SECRET, { issuer: "marshal-backend" });
    next();
  } catch (e) {
    if (e.name === "TokenExpiredError") {
      return next(new UnauthorizedError("token_expired"));
    }
    return next(new UnauthorizedError("invalid_token"));
  }
}

// Require ADMIN role (must be used after requireAuth).
function requireAdmin(req, res, next) {
  if (!req.user) return next(new UnauthorizedError("missing_token"));
  if (req.user.role !== "ADMIN") {
    console.log(JSON.stringify({
      type: "security",
      event: "unauthorized_admin_access",
      userId: req.user.sub,
      email: req.user.email,
      path: req.originalUrl,
      method: req.method
    }));
    return next(new ForbiddenError("admin_only"));
  }
  next();
}

module.exports = { requireAuth, requireAdmin, extractToken };
