import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { deleteWatch, updateWatch, WriteError, type WatchPatch } from "@/lib/vault/writer";

const numOrNull = (v: unknown, key: string) => {
  if (v === null || v === "") return null;
  if (typeof v === "number") return v;
  throw new WriteError(400, `${key} harus angka`);
};

/**
 * Ubah judul watchlist. Semua field opsional:
 * { epDelta: 1 | -1, progress, total, status, rating, type, coverPos: { x, y, z } | null }
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handleWrite(async () => {
    const { slug } = await ctx.params;
    const b = await readJsonBody(req);
    const patch: WatchPatch = {};
    if (b.epDelta !== undefined) patch.epDelta = numOrNull(b.epDelta, "epDelta") ?? undefined;
    if (b.progress !== undefined) patch.progress = numOrNull(b.progress, "progress") ?? 0;
    if (b.total !== undefined) patch.total = numOrNull(b.total, "total");
    if (b.rating !== undefined) patch.rating = numOrNull(b.rating, "rating");
    if (b.status !== undefined) patch.status = asStr(b.status) ?? "";
    if (b.type !== undefined) patch.type = asStr(b.type) ?? "";
    if (b.coverPos !== undefined) {
      if (b.coverPos === null) patch.coverPos = null;
      else {
        const c = b.coverPos as Record<string, unknown>;
        if (!c || typeof c !== "object" || ![c.x, c.y, c.z].every((n) => typeof n === "number" && Number.isFinite(n)))
          throw new WriteError(400, "coverPos harus { x, y, z }");
        patch.coverPos = { x: c.x as number, y: c.y as number, z: c.z as number };
      }
    }
    if (!Object.keys(patch).length) throw new WriteError(400, "Ga ada yang diubah");
    return updateWatch(decodeURIComponent(slug), patch);
  });
}

/** Hapus judul: file dipindah ke Archive/Deleted/Watchlist/ (bisa diurungkan lewat /undelete). Body: {} */
export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handleWrite(async () => {
    const { slug } = await ctx.params;
    await readJsonBody(req);
    return deleteWatch(decodeURIComponent(slug));
  });
}
