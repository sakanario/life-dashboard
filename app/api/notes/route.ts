import { getVault } from "@/lib/vault";
import { safeResolve } from "@/lib/vault/paths";

export async function GET(req: Request) {
  const v = await getVault();
  const safe = safeResolve(new URL(req.url).searchParams.get("path") ?? "");
  const d = safe && v.docs.get(safe.rel);
  if (!d) return Response.json({ error: "catatan tidak ketemu" }, { status: 404 });
  return Response.json({ path: d.path, frontmatter: d.fm, body: d.body, mtime: d.mtime });
}
