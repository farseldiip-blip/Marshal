/* =========================================================
   src/middleware/requestLogger.js — Structured request log.
   ========================================================= */
module.exports = function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(
      JSON.stringify({
        type: "request",
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms
      })
    );
  });
  next();
};
