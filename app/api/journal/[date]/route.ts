import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { getVault } from "@/lib/vault";
import { saveJournal, WriteError, type HabitPatch } from "@/lib/vault/writer";

export async function GET(_req: Request, ctx: { params: Promise<{ date: string }> }) {
  const { date } = await ctx.params;
  const j = (await getVault()).journal.find((x) => x.date === date);
  return j ? Response.json(j) : Response.json({ error: "jurnal belum ada" }, { status: 404 });
}

/**
 * Simpan jurnal (sebagian field boleh). Body:
 * { highlight?, summary?, habits?: { <id>: "done" | "missed" | null }, base?: { highlight?, summary? } }
 * `base` = isi waktu form dibuka; kalau beda sama file sekarang → 409.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ date: string }> }) {
  return handleWrite(async () => {
    const { date } = await ctx.params;
    const b = await readJsonBody(req);
    let habits: HabitPatch | undefined;
    if (b.habits !== undefined) {
      if (!b.habits || typeof b.habits !== "object" || Array.isArray(b.habits)) throw new WriteError(400, "habits harus object");
      habits = {};
      for (const [k, val] of Object.entries(b.habits as Record<string, unknown>)) {
        if (val !== null && val !== "done" && val !== "missed") throw new WriteError(400, `Status habit tidak valid: ${String(val)}`);
        habits[k] = val;
      }
    }
    const base = b.base && typeof b.base === "object" ? (b.base as Record<string, unknown>) : undefined;
    return saveJournal(date, {
      highlight: asStr(b.highlight),
      summary: asStr(b.summary),
      habits,
      base: base ? { highlight: asStr(base.highlight), summary: asStr(base.summary) } : undefined,
    });
  });
}
