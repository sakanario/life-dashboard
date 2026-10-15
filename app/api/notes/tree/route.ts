import { getVault } from "@/lib/vault";
import { buildTree } from "@/lib/vault/notes";

export async function GET() {
  return Response.json(buildTree(await getVault()));
}
