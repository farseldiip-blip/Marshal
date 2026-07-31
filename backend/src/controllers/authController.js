/* =========================================================
   src/controllers/authController.js
   ========================================================= */
const { register, login, getUserById } = require("../services/authService");

function registerHandler(req, res, next) {
  // Never pass role from client — registration is always USER.
  register({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    phone: req.body.phone,
    preferredLang: req.body.preferredLang
  })
    .then((r) => res.status(201).json({ ok: true, ...r }))
    .catch(next);
}

function loginHandler(req, res, next) {
  login({ email: req.body.email, password: req.body.password })
    .then((r) => res.json({ ok: true, ...r }))
    .catch(next);
}

function meHandler(req, res, next) {
  getUserById(req.user.sub)
    .then((user) => res.json({ ok: true, user }))
    .catch(next);
}

module.exports = { registerHandler, loginHandler, meHandler };
