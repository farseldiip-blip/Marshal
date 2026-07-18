// Standalone test of the validator logic (mirrors js/booking.js).
function validateName(v) {
  v = (v || "").trim();
  if (!v) return "req";
  if (v.length < 3) return "min";
  if (!/^[A-Za-z\u0600-\u06FF\s]+$/.test(v)) return "chars";
  if (/(.)\1{2,}/.test(v.replace(/\s/g, ""))) return "rep";
  const low = v.toLowerCase().replace(/\s+/g, "");
  const banned = ["test", "user", "guest", "abc", "xyz", "name", "asdf", "qwerty"];
  if (banned.some(b => low.indexOf(b) !== -1)) return "banned";
  const words = v.trim().split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.every(w => w.length < 2)) return "real";
  return null;
}
function validateEmail(v) {
  v = (v || "").trim();
  if (!v) return "req";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return "fmt";
  return null;
}
function validatePhone(v) {
  v = (v || "").trim();
  if (!v) return "req";
  if (/[A-Za-z]/.test(v)) return "chars";
  const d = v.replace(/[\s+()-]/g, "");
  if (!/^\d{8,15}$/.test(d)) return "len";
  if (/^(?:\+?20)?01[0125]\d{8}$/.test(d)) return null;
  if (/^\d{8,15}$/.test(d)) return null;
  return "fmt";
}
let pass=0, fail=0;
function ck(d, got, want){ const ok=(got===want); if(ok)pass++; else fail++; console.log((ok?"PASS":"FAIL"), d, "=>", got); }
// Name
ck("dddd rejected", validateName("dddd"), "rep");
ck("aaa rejected", validateName("aaa"), "rep");
ck("test rejected", validateName("test"), "banned");
ck("12345 rejected", validateName("12345"), "chars");
ck("aa rejected(min)", validateName("aa"), "min");
ck("John Doe ok", validateName("John Doe"), null);
ck("محمد ok", validateName("محمد على"), null);
ck("repeated zzzz", validateName("zzzz"), "rep");
// Email
ck("dd rejected", validateEmail("dd"), "fmt");
ck("test rejected", validateEmail("test"), "fmt");
ck("abc@ rejected", validateEmail("abc@"), "fmt");
ck("test@test rejected", validateEmail("test@test"), "fmt");
ck("user@gmail.com ok", validateEmail("user@gmail.com"), null);
ck("name@example.com ok", validateEmail("name@example.com"), null);
// Phone
ck("dddd rejected", validatePhone("dddd"), "chars");
ck("01012345678 ok", validatePhone("01012345678"), null);
ck("01112345678 ok", validatePhone("01112345678"), null);
ck("01212345678 ok", validatePhone("01212345678"), null);
ck("01512345678 ok", validatePhone("01512345678"), null);
ck("+201012345678 ok", validatePhone("+201012345678"), null);
ck("123 rejected(len)", validatePhone("123"), "len");
console.log(pass+" passed, "+fail+" failed");
process.exit(fail?1:0);
