import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./auth";
import { WriteError } from "./vault/writer";

/**
 * Penjaga endpoint tulis: wajib JSON (biar form/halaman situs lain tidak bisa nembak
 * lewat "simple request") dan Origin harus sama dengan host yang diminta.
 */
export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let ok = false;
    try {
      ok = new URL(origin).host === host;
    } catch {}
    if (!ok) throw new WriteError(403, "Origin tidak diizinkan");
  }
}

export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  checkOrigin(req);
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json"))
    throw new WriteError(415, "Body harus JSON");
  try {
    const b = await req.json();
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error();
    return b as Record<string, unknown>;
  } catch {
    throw new WriteError(400, "JSON tidak valid");
  }
}

/** Dicek ulang di tiap route tulis, jangan cuma ngandelin proxy. */
async function requireSession() {
  if (!(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value))) throw new WriteError(401, "Belum login");
}

export async function handleWrite(fn: () => Promise<unknown>): Promise<Response> {
  try {
    await requireSession();
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof WriteError) return Response.json({ error: e.message, detail: e.detail ?? null }, { status: e.status });
    console.error("[vault write]", e);
    return Response.json({ error: "Gagal nulis ke vault" }, { status: 500 });
  }
}

export const asStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
