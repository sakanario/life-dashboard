import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { restoreProject } from "@/lib/vault/writer";

/** Pulihkan proyek dari arsip. Body: { status? } (default paused; Urungkan arsip kirim status lama) */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handleWrite(async () => {
    const { slug } = await ctx.params;
    const b = await readJsonBody(req);
    return restoreProject(slug, asStr(b.status) || undefined);
  });
}
