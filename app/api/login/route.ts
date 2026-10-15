import { cookies } from "next/headers";
import { asStr, readJsonBody } from "@/lib/api";
import { configuredPin, createSessionToken, pinMatches, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { WriteError } from "@/lib/vault/writer";

/* Anti tebak PIN: maks 5 salah per 10 menit (satu user, jadi hitungannya global). */
const WINDOW = 10 * 60_000, MAX_FAIL = 5;
// disimpan per PIN: ganti APP_PIN = hitungan mulai dari nol
const g = globalThis as unknown as { __ldLoginFails?: { pin: string; at: number[] } };
const fails = () => {
  const pin = configuredPin();
  if (g.__ldLoginFails?.pin !== pin) g.__ldLoginFails = { pin, at: [] };
  return (g.__ldLoginFails.at = g.__ldLoginFails.at.filter((t) => Date.now() - t < WINDOW));
};

const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers });

/** Login. Body: { pin } → set cookie sesi 30 hari. */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await readJsonBody(req);
  } catch (e) {
    return json({ error: (e as WriteError).message }, (e as WriteError).status ?? 400);
  }
  if (!configuredPin()) return json({ error: "APP_PIN belum diisi di .env" }, 503);

  const recent = fails();
  if (recent.length >= MAX_FAIL) {
    const wait = Math.ceil((recent[0] + WINDOW - Date.now()) / 1000);
    return json({ error: `Kebanyakan salah. Coba lagi ${Math.ceil(wait / 60)} menit lagi.` }, 429, { "retry-after": String(wait) });
  }
  if (!(await pinMatches(asStr(b.pin) ?? ""))) {
    recent.push(Date.now());
    await new Promise((r) => setTimeout(r, 400));
    const left = MAX_FAIL - recent.length;
    return json({ error: left > 0 ? `PIN salah. Sisa ${left} kali.` : "PIN salah. Login dikunci 10 menit." }, 401);
  }

  g.__ldLoginFails = { pin: configuredPin(), at: [] };
  const https = req.headers.get("x-forwarded-proto") === "https" || new URL(req.url).protocol === "https:";
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return json({ ok: true });
}
