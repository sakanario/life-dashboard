import { getVault } from "@/lib/vault";
import { search } from "@/lib/vault/notes";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json(search(await getVault(), q));
}
