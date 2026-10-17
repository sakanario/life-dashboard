// Setup login authenticator (REQUIREMENTS §9). Jalanin SENDIRI di terminal PC ini (jangan lewat chat/AI,
// output-nya berisi secret & kode cadangan):
//   node scripts/setup-totp.mjs                  setup pertama: bikin TOTP_SECRET (+ SESSION_SECRET kalau belum ada)
//   node scripts/setup-totp.mjs --force          ganti secret (HP lama & semua sesi batal, kode cadangan baru)
//   node scripts/setup-totp.mjs --backup-codes   cuma bikin ulang 8 kode cadangan (yang lama batal)
//   --env <file> / --state <file>                lokasi lain (default .env & .auth/state.json di folder app)
// Secret ditulis langsung ke .env, QR `otpauth://` cuma tampil di terminal ini, ga pernah lewat app web.
// Habis itu restart server (prod: scripts\uninstall-autostart.ps1 -KeepTask lalu Start-ScheduledTask "Life Dashboard").
import { createHash, randomBytes, randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const app = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : def;
};
const envFile = opt("--env", path.join(app, ".env"));
const stateFile = opt("--state", path.join(app, ".auth", "state.json"));
const force = args.includes("--force");
const backupOnly = args.includes("--backup-codes");

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const base32 = (bytes) => {
  let out = "", bits = 0, value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return bits > 0 ? out + B32[(value << (5 - bits)) & 31] : out;
};
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
// harus sama persis dengan lib/login-guard.ts
const secretId = (secret) => sha256("ld-totp:" + secret).slice(0, 16);
const hashBackup = (code) => sha256("ld-backup:" + code.replace(/[\s-]/g, "").toUpperCase());

// .env dibaca per baris biar isi lain (komentar, urutan) tetap
const raw = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
let lines = raw ? raw.split(/\r?\n/) : [];
if (lines.length && lines[lines.length - 1] === "") lines.pop();
const get = (k) => {
  const l = lines.find((x) => x.startsWith(k + "="));
  return l ? l.slice(k.length + 1).replace(/\s+#.*$/, "").trim() : "";
};
const set = (k, v) => {
  const i = lines.findIndex((x) => x.startsWith(k + "="));
  if (i >= 0) lines[i] = `${k}=${v}`;
  else lines.push(`${k}=${v}`);
};

let secret = get("TOTP_SECRET").replace(/[\s=-]/g, "").toUpperCase();
if (backupOnly) {
  if (!secret) {
    console.error("TOTP_SECRET belum ada. Jalanin dulu tanpa --backup-codes.");
    process.exit(1);
  }
} else {
  if (secret && !force) {
    console.error("TOTP_SECRET sudah ada. Pakai --force buat ganti (authenticator lama & semua sesi batal),");
    console.error("atau --backup-codes kalau cuma mau kode cadangan baru.");
    process.exit(1);
  }
  secret = base32(randomBytes(20)); // 160 bit, ukuran yang disaranin RFC 4226
  set("TOTP_SECRET", secret);
  if (get("SESSION_SECRET").length < 32) set("SESSION_SECRET", randomBytes(32).toString("base64url"));
  // metode PIN udah dihapus
  lines = lines.filter((x) => !x.startsWith("APP_PIN="));
  fs.writeFileSync(envFile, lines.join(eol) + eol);
}

// kode cadangan: 8 × 10 karakter base32 (50 bit), yang disimpan cuma hash-nya
const codes = Array.from({ length: 8 }, () => Array.from({ length: 10 }, () => B32[randomInt(32)]).join(""));
let lastStep = 0;
try {
  const old = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  if (old.secretId === secretId(secret)) lastStep = Number(old.lastStep) || 0;
} catch {}
fs.mkdirSync(path.dirname(stateFile), { recursive: true });
fs.writeFileSync(stateFile, JSON.stringify({ secretId: secretId(secret), lastStep, backup: codes.map(hashBackup) }, null, 2));

if (!backupOnly) {
  const user = get("USER_NAME") || "owner";
  const issuer = "Life Dashboard";
  const url = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  console.log("\nScan QR ini pakai aplikasi authenticator (Google Authenticator, Aegis, 2FAS, dll):\n");
  console.log(await QRCode.toString(url, { type: "terminal", small: true, errorCorrectionLevel: "M" }));
  console.log("Ga bisa scan? Masukin manual:");
  console.log(`  akun   : ${issuer} (${user})`);
  console.log(`  secret : ${secret.match(/.{1,4}/g).join(" ")}`);
  console.log("  tipe   : berbasis waktu, 6 digit, 30 detik\n");
  console.log(`TOTP_SECRET${get("SESSION_SECRET") ? " & SESSION_SECRET" : ""} ditulis ke ${envFile}`);
}
console.log("\nKode cadangan (sekali pakai, buat kalau HP hilang). Catat di tempat aman, ga bakal ditampilin lagi:\n");
for (let i = 0; i < codes.length; i += 2) console.log(`  ${codes[i].slice(0, 5)}-${codes[i].slice(5)}    ${codes[i + 1].slice(0, 5)}-${codes[i + 1].slice(5)}`);
console.log("\nRestart server biar secret baru kepakai, lalu bersihin layar terminal ini (cls).");
