import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { setGoalStatus, WriteError } from "@/lib/vault/writer";

/** Ubah status goal. Body: { status: "active" | "done" | "dropped" } */
export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handleWrite(async () => {
    const { slug } = await ctx.params;
    const b = await readJsonBody(req);
    const status = asStr(b.status);
    if (!status) throw new WriteError(400, "Perlu status");
    return setGoalStatus(slug, status);
  });
}
