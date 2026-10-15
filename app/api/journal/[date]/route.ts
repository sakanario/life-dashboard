import { getVault } from "@/lib/vault";

export async function GET(_req: Request, ctx: { params: Promise<{ date: string }> }) {
  const { date } = await ctx.params;
  const j = (await getVault()).journal.find((x) => x.date === date);
  return j ? Response.json(j) : Response.json({ error: "jurnal belum ada" }, { status: 404 });
}
