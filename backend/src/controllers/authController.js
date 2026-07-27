/* =========================================================
   src/controllers/authController.js
   ========================================================= */
const { register, login } = require("../services/authService");

function registerHandler(req, res, next) {
  // Never pass role from client — registration is always USER.
  register({ email: req.body.email, password: req.body.password })
    .then((r) => res.status(201).json({ ok: true, ...r }))
    .catch(next);
}

function loginHandler(req, res, next) {
  login({ email: req.body.email, password: req.body.password })
    .then((r) => res.json({ ok: true, ...r }))
    .catch(next);
}

function meHandler(req, res) {
  res.json({ ok: true, user: req.user });
}

module.exports = { registerHandler, loginHandler, meHandler };
