// node --test tests/   (Node 24: file .ts di-import langsung, tanpa build)
import assert from "node:assert/strict";
import { test } from "node:test";
import { base32Decode, base32Encode, hotp, matchTotp, totpStep } from "../lib/totp.ts";
import { authConfigured, createSessionToken, verifySessionToken } from "../lib/auth.ts";

// secret contoh RFC 6238 lampiran B ("12345678901234567890")
const RFC_KEY = new TextEncoder().encode("12345678901234567890");
const RFC_B32 = base32Encode(RFC_KEY);

test("base32 bolak-balik", () => {
  assert.equal(RFC_B32, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.deepEqual(base32Decode(RFC_B32.toLowerCase().match(/.{4}/g).join(" ")), RFC_KEY);
  assert.throws(() => base32Decode("ABC1"));
});

test("vektor tes RFC 6238 (SHA-1, 8 digit)", async () => {
  const cases = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  for (const [t, want] of cases) assert.equal(await hotp(RFC_KEY, Math.floor(t / 30), 8), want, `T=${t}`);
});

test("kode benar, toleransi ±1 langkah, kode lama ditolak", async () => {
  const now = 1_760_000_000_000;
  const step = totpStep(now);
  const at = (d) => hotp(RFC_KEY, step + d);
  assert.equal(await matchTotp(RFC_B32, await at(0), now), step);
  assert.equal(await matchTotp(RFC_B32, await at(-1), now), step - 1);
  assert.equal(await matchTotp(RFC_B32, await at(1), now), step + 1);
  const old = await at(-2);
  if (![await at(-1), await at(0), await at(1)].includes(old)) assert.equal(await matchTotp(RFC_B32, old, now), null);
});

test("kode salah / format salah ditolak", async () => {
  const now = 1_760_000_000_000;
  const right = await hotp(RFC_KEY, totpStep(now));
  const wrong = String((Number(right) + 1) % 1e6).padStart(6, "0");
  assert.equal(await matchTotp(RFC_B32, wrong, now, 0), null);
  for (const bad of ["", "12345", "1234567", "12345a", " 123456"]) assert.equal(await matchTotp(RFC_B32, bad, now), null);
});

test("sesi: valid, kadaluarsa, dipalsu, batal setelah ganti secret", async () => {
  process.env.TOTP_SECRET = RFC_B32;
  process.env.SESSION_SECRET = "x".repeat(32);
  assert.ok(authConfigured());
  const tok = await createSessionToken();
  assert.ok(await verifySessionToken(tok));
  assert.ok(!(await verifySessionToken(tok, Date.now() + 31 * 24 * 3600_000)), "kadaluarsa");
  const [exp, mac] = tok.split(".");
  assert.ok(!(await verifySessionToken(`${Number(exp) + 999}.${mac}`)), "exp diubah");

  process.env.SESSION_SECRET = "y".repeat(32);
  assert.ok(!(await verifySessionToken(tok)), "ganti SESSION_SECRET");
  process.env.SESSION_SECRET = "x".repeat(32);
  assert.ok(await verifySessionToken(tok));
  process.env.TOTP_SECRET = base32Encode(new Uint8Array(20).fill(7));
  assert.ok(!(await verifySessionToken(tok)), "ganti TOTP_SECRET");

  process.env.SESSION_SECRET = "pendek";
  assert.ok(!authConfigured(), "SESSION_SECRET kurang dari 32 karakter");
  await assert.rejects(createSessionToken());
  delete process.env.TOTP_SECRET;
  process.env.SESSION_SECRET = "x".repeat(32);
  assert.ok(!authConfigured(), "TOTP_SECRET kosong = terkunci");
});
