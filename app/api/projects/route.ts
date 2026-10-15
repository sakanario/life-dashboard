import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { createProject } from "@/lib/vault/writer";
import { getProjects } from "@/lib/vault/views";

export async function GET() {
  // daftar ringkas: quest per proyek ada di /api/projects/:slug
  return Response.json((await getProjects()).map((p) => ({ ...p, quests: undefined })));
}

/** Bikin proyek baru. Body: { title, type: "personal" | "work", status?, goal?, desc? } */
export async function POST(req: Request) {
  return handleWrite(async () => {
    const b = await readJsonBody(req);
    return createProject({ title: asStr(b.title) ?? "", type: asStr(b.type) ?? "", status: asStr(b.status), goal: asStr(b.goal) || null, desc: asStr(b.desc) });
  });
}
