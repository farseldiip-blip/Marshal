const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const candidates = ['admin@marshal.test', 'admin@marshal.com', 'admin2@marshal.test'];
const passwords = ['ChangeMe123!', 'admin123', 'Admin123!', 'password123', 'admin', 'Marshal123!'];
(async () => {
  for (const email of candidates) {
    const user = await p.user.findUnique({ where: { email } });
    if (!user) continue;
    console.log('User:', email, 'hash prefix:', user.passwordHash.substring(0, 20));
    for (const pw of passwords) {
      const ok = await bcrypt.compare(pw, user.passwordHash);
      if (ok) { console.log('  FOUND password:', pw); break; }
    }
  }
  await p.$disconnect();
})();
