import "server-only";
import { WriteError } from "./vault/writer";

/**
 * Penjaga endpoint tulis: wajib JSON (biar form/halaman situs lain tidak bisa nembak
 * lewat "simple request") dan Origin harus sama dengan host yang diminta.
 */
export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let ok = false;
    try {
      ok = new URL(origin).host === host;
    } catch {}
    if (!ok) throw new WriteError(403, "Origin tidak diizinkan");
  }
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

export async function handleWrite(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof WriteError) return Response.json({ error: e.message, detail: e.detail ?? null }, { status: e.status });
    console.error("[vault write]", e);
    return Response.json({ error: "Gagal nulis ke vault" }, { status: 500 });
  }
}

export const asStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
