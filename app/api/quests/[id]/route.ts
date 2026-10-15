import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { deleteQuest, editQuest, moveQuest, toggleQuest, WriteError } from "@/lib/vault/writer";

/**
 * Ubah quest. `text` = teks quest sekarang (buat validasi baris). Salah satu dari:
 * { text, done } centang / batal (sekalian catat ke jurnal) · { text, newText } edit teks · { text, move: "up" | "down" } ubah urutan
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleWrite(async () => {
    const { id } = await ctx.params;
    const b = await readJsonBody(req);
    const text = asStr(b.text);
    if (!text) throw new WriteError(400, "Perlu text");
    const qid = decodeURIComponent(id);
    if (typeof b.done === "boolean") return toggleQuest(qid, { text, done: b.done });
    const newText = asStr(b.newText);
    if (newText !== undefined) return editQuest(qid, { text, newText });
    if (b.move === "up" || b.move === "down") return moveQuest(qid, { text, dir: b.move });
    throw new WriteError(400, "Perlu done, newText, atau move");
  });
}

/** Hapus quest (beserta subquest-nya). Body: { text } */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleWrite(async () => {
    const { id } = await ctx.params;
    const text = asStr((await readJsonBody(req)).text);
    if (!text) throw new WriteError(400, "Perlu text");
    return deleteQuest(decodeURIComponent(id), { text });
  });
}
