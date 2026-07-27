/* =========================================================
   src/app.js — Express app wiring (exported, not started).
   ========================================================= */
const express = require("express");
const helmetMiddleware = require("./middleware/helmet");
const corsMiddleware = require("./middleware/cors");
const requestLogger = require("./middleware/requestLogger");
const errorHandler = require("./middleware/errorHandler");
const healthRoutes = require("./routes/health.routes");
const bookingsRoutes = require("./routes/bookings.routes");
const paymentsRoutes = require("./routes/payments.routes");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const contentRoutes = require("./routes/content.routes");

const app = express();

// Security + parsing middleware.
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(express.json({ limit: "16kb" }));
app.use(requestLogger);

// Routes
app.use("/api/health", healthRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", contentRoutes);

// 404 for unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown API route" } });
});

// Central error handler (must be last).
app.use(errorHandler);

module.exports = app;
