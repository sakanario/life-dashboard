import { handleWrite, readJsonBody } from "@/lib/api";
import { archiveProject } from "@/lib/vault/writer";

/** Arsipkan proyek: status archived + folder pindah ke Archive/Projects/. Body: {} */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handleWrite(async () => {
    const { slug } = await ctx.params;
    await readJsonBody(req);
    return archiveProject(slug);
  });
}
