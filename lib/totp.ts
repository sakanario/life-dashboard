/**
 * TOTP (RFC 6238): HMAC-SHA1, 6 digit, langkah 30 detik. Pakai Web Crypto, tanpa library.
 * Sengaja tanpa import apa pun biar bisa dites langsung pakai `node --test`.
 */

export const TOTP_PERIOD = 30; // detik
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Rapikan secret base32: buang spasi/padding, huruf besar. */
export const normalizeBase32 = (s: string) => s.replace(/[\s=-]/g, "").toUpperCase();

export function base32Decode(input: string): Uint8Array {
  const s = normalizeBase32(input);
  const out: number[] = [];
  let bits = 0, value = 0;
  for (const ch of s) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Secret base32 tidak valid");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function base32Encode(bytes: Uint8Array): string {
  let out = "", bits = 0, value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** HOTP (RFC 4226) buat satu counter. */
export async function hotp(key: Uint8Array, counter: number, digits = 6): Promise<string> {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, msg));
  const off = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const totpStep = (now = Date.now()) => Math.floor(now / 1000 / TOTP_PERIOD);

/**
 * Cari langkah waktu yang cocok sama `code` (toleransi ±`window` langkah buat jam HP yang meleset).
 * Balikin nomor langkahnya (buat anti replay) atau null kalau ga ada yang cocok.
 */
export async function matchTotp(secretB32: string, code: string, now = Date.now(), window = 1): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secretB32);
  const step = totpStep(now);
  let found: number | null = null;
  // semua kandidat dicek (ga berhenti di yang pertama cocok) biar waktunya sama
  for (let d = -window; d <= window; d++) {
    const want = await hotp(key, step + d);
    let diff = 0;
    for (let i = 0; i < 6; i++) diff |= want.charCodeAt(i) ^ code.charCodeAt(i);
    if (diff === 0 && found === null) found = step + d;
  }
  return found;
}
