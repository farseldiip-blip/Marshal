/* =========================================================
   src/server.js — HTTP server bootstrap.
   ========================================================= */
const app = require("./app");
const ENV = require("./config/env");
const scheduler = require("./services/schedulerService");

const server = app.listen(ENV.PORT, () => {
  console.log(
    JSON.stringify({
      type: "startup",
      service: "marshal-backend",
      port: ENV.PORT,
      nodeEnv: ENV.NODE_ENV
    })
  );
  scheduler.start();
});

function shutdown(signal) {
  console.log(JSON.stringify({ type: "shutdown", signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = server;
