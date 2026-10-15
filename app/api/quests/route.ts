import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { addQuest } from "@/lib/vault/writer";

/** Tambah quest ke Uncategorize.md atau README proyek. Body: { text, project? } */
export async function POST(req: Request) {
  return handleWrite(async () => {
    const b = await readJsonBody(req);
    return addQuest({ text: asStr(b.text) ?? "", project: asStr(b.project) || null });
  });
}
