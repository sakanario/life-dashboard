import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { deleteGoal, setGoalStatus, updateGoal, WriteError } from "@/lib/vault/writer";

/**
 * Ubah goal. Body: { status: "active" | "done" | "dropped" }
 * atau field edit: { title?, horizon?, target?: YYYY-MM-DD | null, desc? }
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handleWrite(async () => {
    const { slug } = await ctx.params;
    const b = await readJsonBody(req);
    const status = asStr(b.status);
    if (status) return setGoalStatus(slug, status);
    const patch = {
      title: asStr(b.title),
      horizon: asStr(b.horizon),
      target: b.target === null ? null : asStr(b.target),
      desc: asStr(b.desc),
    };
    if (Object.values(patch).every((v) => v === undefined)) throw new WriteError(400, "Ga ada yang diubah");
    return updateGoal(slug, patch);
  });
}

/** Hapus goal: file dipindah ke Archive/Goals/ (bisa diurungkan lewat /restore). Body: {} */
export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handleWrite(async () => {
    const { slug } = await ctx.params;
    await readJsonBody(req);
    return deleteGoal(slug);
  });
}
