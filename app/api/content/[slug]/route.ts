import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { deleteContent, updateContent, WriteError, type ContentPatch } from "@/lib/vault/writer";

const numOrNull = (v: unknown, key: string) => {
  if (v === null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  throw new WriteError(400, `stats.${key} harus angka`);
};

/**
 * Ubah frontmatter konten. Semua field opsional:
 * { stage, platform: string[], project: slug | null, published: YYYY-MM-DD | null, stats: { views, comments, retention } }
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handleWrite(async () => {
    const { slug } = await ctx.params;
    const b = await readJsonBody(req);
    const patch: ContentPatch = {};
    if (b.stage !== undefined) patch.stage = asStr(b.stage) ?? "";
    if (b.platform !== undefined) {
      if (!Array.isArray(b.platform) || b.platform.some((x) => typeof x !== "string")) throw new WriteError(400, "platform harus list teks");
      patch.platform = b.platform as string[];
    }
    if (b.project !== undefined) patch.project = asStr(b.project) || null;
    if (b.published !== undefined) patch.published = asStr(b.published) || null;
    if (b.stats !== undefined) {
      if (!b.stats || typeof b.stats !== "object" || Array.isArray(b.stats)) throw new WriteError(400, "stats harus object");
      const s = b.stats as Record<string, unknown>;
      patch.stats = {};
      if ("views" in s) patch.stats.views = numOrNull(s.views, "views");
      if ("comments" in s) patch.stats.comments = numOrNull(s.comments, "comments");
      if ("retention" in s) patch.stats.retention = asStr(s.retention)?.trim() || null;
    }
    if (!Object.keys(patch).length) throw new WriteError(400, "Ga ada yang diubah");
    return updateContent(decodeURIComponent(slug), patch);
  });
}

/** Hapus konten: file dipindah ke Archive/Deleted/Content/ (bisa diurungkan lewat /undelete). Body: {} */
export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handleWrite(async () => {
    const { slug } = await ctx.params;
    await readJsonBody(req);
    return deleteContent(decodeURIComponent(slug));
  });
}
