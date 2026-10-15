/**
 * Login PIN (REQUIREMENTS §9). Semua device wajib login (keputusan 2026-10-15), sesi = cookie httpOnly 30 hari.
 * Token = `<kadaluarsa>.<HMAC>`; kuncinya diturunin dari APP_PIN (+ SESSION_SECRET kalau ada),
 * jadi ganti PIN = semua sesi lama otomatis batal. Pakai Web Crypto biar jalan di proxy maupun route.
 */

export const SESSION_COOKIE = "ld_session";
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // detik

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const configuredPin = () => process.env.APP_PIN?.trim() ?? "";

async function hmacKey(): Promise<CryptoKey | null> {
  const pin = configuredPin();
  if (!pin) return null;
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`ld-session:${pin}:${process.env.SESSION_SECRET ?? ""}`));
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
  if (!key) throw new Error("APP_PIN belum diisi");
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

/** Cek PIN: dua-duanya di-HMAC dulu biar perbandingannya panjang tetap. */
export async function pinMatches(input: string) {
  const key = await hmacKey();
  if (!key) return false;
  return safeEqual(await sign(key, "p:" + input.trim()), await sign(key, "p:" + configuredPin()));
}
