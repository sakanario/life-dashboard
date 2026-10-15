import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { setProjectStatus, WriteError } from "@/lib/vault/writer";
import { getProjects } from "@/lib/vault/views";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const p = (await getProjects()).find((x) => x.slug === slug);
  return p ? Response.json(p) : Response.json({ error: "proyek tidak ketemu" }, { status: 404 });
}

/** Ubah field proyek. Body: { status: "idea" | "active" | "paused" | "done" } */
export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handleWrite(async () => {
    const { slug } = await ctx.params;
    const b = await readJsonBody(req);
    const status = asStr(b.status);
    if (!status) throw new WriteError(400, "Perlu status");
    return setProjectStatus(slug, status);
  });
}
