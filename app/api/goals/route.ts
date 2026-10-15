import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { createGoal } from "@/lib/vault/writer";
import { getGoals } from "@/lib/vault/views";

export async function GET() {
  return Response.json(await getGoals());
}

/** Bikin goal baru. Body: { title, horizon: "vision" | "medium" | "year" | "quarter", target?: YYYY-MM-DD, desc? } */
export async function POST(req: Request) {
  return handleWrite(async () => {
    const b = await readJsonBody(req);
    return createGoal({ title: asStr(b.title) ?? "", horizon: asStr(b.horizon) ?? "", target: asStr(b.target) || null, desc: asStr(b.desc) });
  });
}
