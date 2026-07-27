/* =========================================================
   src/config/database.js — Prisma client singleton.
   ========================================================= */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

module.exports = prisma;
