/* =========================================================
   src/middleware/errorHandler.js — Central error handler.
   ---------------------------------------------------------
   SECURITY: Never expose stack traces, Prisma internals,
   or system details to the client in any environment.
   ========================================================= */
const { ZodError } = require("zod");
const multer = require("multer");

module.exports = function errorHandler(err, req, res, next) {
  // CORS error
  if (err && err.message === "CORS_ORIGIN_NOT_ALLOWED") {
    return res.status(403).json({ error: { code: "CORS_DENIED", message: "Origin not allowed" } });
  }

  // Multer errors (file too large, etc.)
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: { code: "FILE_TOO_LARGE", message: "Image must be under 5 MB" } });
    }
    return res.status(422).json({ error: { code: "UPLOAD_ERROR", message: "Invalid upload" } });
  }

  // Zod validation errors — sanitize path details.
  if (err instanceof ZodError) {
    const details = err.errors.map(function (e) {
      return { path: e.path.join("."), message: e.message };
    });
    return res.status(422).json({
      error: { code: "VALIDATION", message: "Invalid input", details: details.slice(0, 10) }
    });
  }

  // App errors carry a code + status.
  const status = err.status || 500;
  const code = err.code || "INTERNAL";

  // Server errors: log details internally, return safe message.
  if (status >= 500) {
    console.error(JSON.stringify({
      type: "error",
      code: code,
      message: err.message ? err.message.substring(0, 200) : "unknown",
      stack: err.stack ? err.stack.substring(0, 500) : undefined,
      path: req.originalUrl,
      method: req.method
    }));
    return res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong" } });
  }

  // Client errors: return the message (already safe from AppError subclasses).
  return res.status(status).json({ error: { code: code, message: err.message } });
};
