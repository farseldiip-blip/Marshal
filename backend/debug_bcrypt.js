const bcrypt = require('bcryptjs');
const hash = '$2a$12$4QlodTvNsuFTX3oj88BENOV7HjKyNid5ljURGQRsrCenb3UKioD9S';
const passwords = ['ChangeMe123!', 'Admin123!', 'admin123', 'password', 'admin@marshal.com'];
async function check() {
  for (const pwd of passwords) {
    const match = await bcrypt.compare(pwd, hash);
    if (match) { console.log('MATCH FOUND:', pwd); process.exit(0); }
  }
  console.log('NO MATCH - checking hash generation');
  // Verify the hash is valid bcrypt
  console.log('Hash rounds:', hash.split('$')[2]);
  // Generate a new hash of ChangeMe123! with same rounds to compare prefix
  const newHash = await bcrypt.hash('ChangeMe123!', 12);
  console.log('New hash:', newHash);
  process.exit(0);
}
check().catch(e => { console.log('Error:', e.message); process.exit(1); });
