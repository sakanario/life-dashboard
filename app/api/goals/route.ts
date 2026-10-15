import { getGoals } from "@/lib/vault/views";

export async function GET() {
  return Response.json(await getGoals());
}
