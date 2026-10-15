import { checkOrigin, handleWrite, readJsonBody } from "@/lib/api";
import { COVER_MAX_BYTES } from "@/lib/vault/watch-format";
import { removeWatchCover, setWatchCover, WriteError } from "@/lib/vault/writer";

/** Upload cover (multipart, field `file`). Server yang re-encode ke webp. */
export async function PUT(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handleWrite(async () => {
    checkOrigin(req);
    const { slug } = await ctx.params;
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) throw new WriteError(415, "Body harus multipart");
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > COVER_MAX_BYTES + 64 * 1024) throw new WriteError(413, "Gambar maks 5 MB");
    let file: FormDataEntryValue | null;
    try {
      file = (await req.formData()).get("file");
    } catch {
      throw new WriteError(400, "Form upload tidak valid");
    }
    if (!(file instanceof File)) throw new WriteError(400, "File gambar belum dipilih");
    if (!file.type.startsWith("image/")) throw new WriteError(415, "File harus gambar");
    if (file.size > COVER_MAX_BYTES) throw new WriteError(413, "Gambar maks 5 MB");
    return setWatchCover(decodeURIComponent(slug), new Uint8Array(await file.arrayBuffer()));
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handleWrite(async () => {
    await readJsonBody(req);
    const { slug } = await ctx.params;
    return removeWatchCover(decodeURIComponent(slug));
  });
}
