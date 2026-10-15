import { getProjects } from "@/lib/vault/views";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const p = (await getProjects()).find((x) => x.slug === slug);
  return p ? Response.json(p) : Response.json({ error: "proyek tidak ketemu" }, { status: 404 });
}
