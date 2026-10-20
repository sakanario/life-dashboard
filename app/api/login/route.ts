import { cookies } from "next/headers";
import { asStr, readJsonBody } from "@/lib/api";
import { authConfigured, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { checkLoginCode, clearFails, clientIp, lockedFor, recordFail } from "@/lib/login-guard";
import { WriteError } from "@/lib/vault/writer";

const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers });

/** Login. Body: { code } (6 digit authenticator atau kode cadangan) → set cookie sesi 30 hari. */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await readJsonBody(req);
  } catch (e) {
    return json({ error: (e as WriteError).message }, (e as WriteError).status ?? 400);
  }
  if (!authConfigured()) return json({ error: "Authenticator belum diatur (jalanin scripts/setup-totp.mjs)" }, 503);

  const ip = clientIp(req);
  const wait = lockedFor(ip);
  if (wait !== null)
    return json({ error: `Kebanyakan salah. Coba lagi ${Math.ceil(wait / 60)} menit lagi.` }, 429, { "retry-after": String(wait) });

  const res = await checkLoginCode(asStr(b.code) ?? "");
  if (!res.ok) {
    // kode bener tapi udah kepakai: bukan tebakan, ga dihitung salah
    if (res.reason === "replay") return json({ error: "Kode ini sudah dipakai. Tunggu kode berikutnya." }, 401);
    const left = recordFail(ip);
    await new Promise((r) => setTimeout(r, 400));
    return json({ error: left > 0 ? `Kode salah. Sisa ${left} kali.` : "Kode salah. Login dikunci sementara." }, 401);
  }

  clearFails(ip);
  // lewat Cloudflare Tunnel: x-forwarded-proto / cf-visitor bilang https walau cloudflared nyambung ke app pakai http
  const https =
    req.headers.get("x-forwarded-proto") === "https" ||
    (req.headers.get("cf-visitor") ?? "").includes('"https"') ||
    new URL(req.url).protocol === "https:";
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return json({ ok: true, backupLeft: res.backupLeft ?? null });
}
