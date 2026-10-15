import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { getContent } from "@/lib/vault/views";
import { createIdea } from "@/lib/vault/writer";

export async function GET() {
  return Response.json(await getContent());
}

/** Ide cepat: bikin Content/<slug>.md dengan stage idea. Body: { title, project?, note? } */
export async function POST(req: Request) {
  return handleWrite(async () => {
    const b = await readJsonBody(req);
    return createIdea({ title: asStr(b.title) ?? "", project: asStr(b.project) || null, note: asStr(b.note) });
  });
}
