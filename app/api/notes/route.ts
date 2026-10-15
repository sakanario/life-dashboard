import { handleWrite, readJsonBody } from "@/lib/api";
import { getVault } from "@/lib/vault";
import { safeResolve } from "@/lib/vault/paths";
import { readNote, saveNote, WriteError } from "@/lib/vault/writer";

/** ?path= → frontmatter + body dari index. ?path=&raw=1 → isi mentah + mtime langsung dari disk (buat editor). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const rel = sp.get("path") ?? "";
  if (sp.get("raw") === "1") {
    try {
      return Response.json(await readNote(rel));
    } catch (e) {
      if (e instanceof WriteError) return Response.json({ error: e.message }, { status: e.status });
      throw e;
    }
  }
  const v = await getVault();
  const safe = safeResolve(rel);
  const d = safe && v.docs.get(safe.rel);
  if (!d) return Response.json({ error: "catatan tidak ketemu" }, { status: 404 });
  return Response.json({ path: d.path, frontmatter: d.fm, body: d.body, mtime: d.mtime });
}

/** Simpan catatan. Body: { content, baseMtime, force? }. Berubah dari luar sejak dibuka → 409 + isi terbaru. */
export async function PUT(req: Request) {
  return handleWrite(async () => {
    const rel = new URL(req.url).searchParams.get("path") ?? "";
    const b = await readJsonBody(req);
    if (typeof b.content !== "string" || typeof b.baseMtime !== "number") throw new WriteError(400, "Perlu content & baseMtime");
    return saveNote(rel, { content: b.content, baseMtime: b.baseMtime, force: b.force === true });
  });
}
