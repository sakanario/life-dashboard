import { cookies } from "next/headers";
import { readJsonBody } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth";
import type { WriteError } from "@/lib/vault/writer";

/** Keluar: hapus cookie sesi di browser ini. Body: {} */
export async function POST(req: Request) {
  try {
    await readJsonBody(req);
  } catch (e) {
    return Response.json({ error: (e as WriteError).message }, { status: (e as WriteError).status ?? 400 });
  }
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
