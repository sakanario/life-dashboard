import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { undeleteContent, WriteError } from "@/lib/vault/writer";

/** Urungkan hapus konten. Body: { from: "Archive/Deleted/Content/<x>.md" } (dari respons DELETE) */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handleWrite(async () => {
    const { slug } = await ctx.params;
    const b = await readJsonBody(req);
    const from = asStr(b.from);
    if (!from) throw new WriteError(400, "Perlu path arsip");
    return undeleteContent(decodeURIComponent(slug), from);
  });
}
