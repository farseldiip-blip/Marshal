/* =========================================================
   src/middleware/validate.js — Zod validation helper.
   ========================================================= */
const { ZodError } = require("zod");

// validate(schema) returns middleware that parses req.body.
function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (e) {
      if (e instanceof ZodError) return next(e);
      next(e);
    }
  };
}

module.exports = { validate };
