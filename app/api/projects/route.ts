import { getProjects } from "@/lib/vault/views";

export async function GET() {
  // daftar ringkas: quest per proyek ada di /api/projects/:slug
  return Response.json((await getProjects()).map((p) => ({ ...p, quests: undefined })));
}
