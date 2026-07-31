const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.findUnique({
  where: { email: 'admin@marshal.com' },
  select: { passwordHash: true }
}).then(u => {
  if (u) {
    console.log('FULL_HASH:' + u.passwordHash);
  } else {
    console.log('NOT FOUND');
  }
  p.$disconnect();
}).catch(e => { console.log('ERR', e.message); p.$disconnect(); });
