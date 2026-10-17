/**
 * Login authenticator / TOTP (REQUIREMENTS §9). Semua device wajib login (keputusan 2026-10-15), sesi = cookie httpOnly 30 hari.
 * Token = `<kadaluarsa>.<HMAC>`; kuncinya diturunin dari SESSION_SECRET + TOTP_SECRET,
 * jadi ganti salah satunya = semua sesi lama otomatis batal. Pakai Web Crypto biar jalan di proxy maupun route.
 * Sengaja tanpa import biar bisa dites langsung pakai `node --test`.
 */

export const SESSION_COOKIE = "ld_session";
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // detik

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const totpSecret = () => (process.env.TOTP_SECRET ?? "").replace(/[\s=-]/g, "").toUpperCase();
const sessionSecret = () => process.env.SESSION_SECRET?.trim() ?? "";

/** Dua-duanya wajib ada (secret TOTP min 80 bit, SESSION_SECRET min 32 karakter); kalau belum, app terkunci total. */
export const authConfigured = () => /^[A-Z2-7]{16,}$/.test(totpSecret()) && sessionSecret().length >= 32;

async function hmacKey(): Promise<CryptoKey | null> {
  if (!authConfigured()) return null;
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`ld-session:${sessionSecret()}:${totpSecret()}`));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(key: CryptoKey, data: string) {
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Banding string tanpa bocorin posisi beda lewat waktu. */
function safeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function createSessionToken(now = Date.now()) {
  const key = await hmacKey();
  if (!key) throw new Error("TOTP_SECRET / SESSION_SECRET belum diisi");
  const exp = String(Math.floor(now / 1000) + SESSION_MAX_AGE);
  return `${exp}.${await sign(key, "s:" + exp)}`;
}

export async function verifySessionToken(token: string | undefined | null, now = Date.now()) {
  if (!token) return false;
  const key = await hmacKey();
  if (!key) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac || !/^\d+$/.test(exp) || Number(exp) * 1000 < now) return false;
  return safeEqual(mac, await sign(key, "s:" + exp));
}
