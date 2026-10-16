import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { undeleteProject, WriteError } from "@/lib/vault/writer";

/** Urungkan hapus proyek. Body: { from: "Archive/Deleted/Projects/<x>/", to: "Projects/<slug>/" } (dari respons DELETE, dibalik) */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handleWrite(async () => {
    const { slug } = await ctx.params;
    const b = await readJsonBody(req);
    const from = asStr(b.from), to = asStr(b.to);
    if (!from || !to) throw new WriteError(400, "Perlu from & to");
    return undeleteProject(slug, { from, to });
  });
}
