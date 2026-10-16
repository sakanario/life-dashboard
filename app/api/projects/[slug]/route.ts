import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { deleteProject, setProjectDesc, setProjectStatus, WriteError } from "@/lib/vault/writer";
import { getProjects } from "@/lib/vault/views";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const p = (await getProjects()).find((x) => x.slug === slug);
  return p ? Response.json(p) : Response.json({ error: "proyek tidak ketemu" }, { status: 404 });
}

/**
 * Ubah field proyek. Body: { status: "idea" | "active" | "paused" | "done" }
 * atau { desc, base } — tulis area deskripsi README; base = isi lama yang dilihat user (cek konflik).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handleWrite(async () => {
    const { slug } = await ctx.params;
    const b = await readJsonBody(req);
    if (typeof b.desc === "string") return setProjectDesc(slug, b.desc, typeof b.base === "string" ? b.base : "");
    const status = asStr(b.status);
    if (!status) throw new WriteError(400, "Perlu status atau desc");
    return setProjectStatus(slug, status);
  });
}

/** Hapus proyek: folder dipindah ke Archive/Deleted/Projects/ (bisa diurungkan lewat /undelete). Body: {} */
export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handleWrite(async () => {
    const { slug } = await ctx.params;
    await readJsonBody(req);
    return deleteProject(slug);
  });
}
