/* =========================================================
   src/services/authService.js — Auth business logic.
   ---------------------------------------------------------
   SECURITY:
   - Passwords hashed with bcrypt (12 rounds).
   - Generic error messages prevent user enumeration.
   - Registration is always USER role (no admin self-register).
   - Failed login attempts are logged (without secrets).
   ========================================================= */
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/database");
const ENV = require("../config/env");
const { ConflictError, UnauthorizedError } = require("../utils/errors");

const BCRYPT_ROUNDS = 12;

async function register({ email, password }) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new UnauthorizedError("invalid_credentials");
  }
  if (!password || String(password).length < 8) {
    throw new UnauthorizedError("invalid_credentials");
  }

  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) throw new ConflictError("email_already_registered");

  const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: normalized, passwordHash, role: "USER" }
  });

  console.log(JSON.stringify({ type: "security", event: "user_registered", email: normalized }));
  return signToken(user);
}

async function login({ email, password }) {
  const normalized = String(email || "").trim().toLowerCase();
  const generic = "Invalid email or password";

  if (!normalized || !password) {
    throw new UnauthorizedError(generic);
  }

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    console.log(JSON.stringify({ type: "security", event: "login_failed", reason: "user_not_found", email: normalized }));
    throw new UnauthorizedError(generic);
  }

  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) {
    console.log(JSON.stringify({ type: "security", event: "login_failed", reason: "bad_password", email: normalized }));
    throw new UnauthorizedError(generic);
  }

  console.log(JSON.stringify({ type: "security", event: "login_success", email: normalized, role: user.role }));
  return signToken(user);
}

function signToken(user) {
  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    ENV.JWT_SECRET,
    { expiresIn: "7d", issuer: "marshal-backend" }
  );
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt
    }
  };
}

module.exports = { register, login, signToken };
