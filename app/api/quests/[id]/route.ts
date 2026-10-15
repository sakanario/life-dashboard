import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { toggleQuest, WriteError } from "@/lib/vault/writer";

/** Centang / batal centang. Body: { text (teks quest buat validasi), done }. Sekalian catat ke jurnal. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleWrite(async () => {
    const { id } = await ctx.params;
    const b = await readJsonBody(req);
    const text = asStr(b.text);
    if (!text || typeof b.done !== "boolean") throw new WriteError(400, "Perlu text & done");
    return toggleQuest(decodeURIComponent(id), { text, done: b.done });
  });
}
