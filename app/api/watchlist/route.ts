import { asStr, handleWrite, readJsonBody } from "@/lib/api";
import { getWatch } from "@/lib/vault/views";
import { createWatch, WriteError } from "@/lib/vault/writer";

export async function GET() {
  return Response.json(await getWatch());
}

/** Tambah judul. Body: { title, type, status?, total? } */
export async function POST(req: Request) {
  return handleWrite(async () => {
    const b = await readJsonBody(req);
    if (b.total !== undefined && b.total !== null && typeof b.total !== "number") throw new WriteError(400, "total harus angka");
    return createWatch({
      title: asStr(b.title) ?? "",
      type: asStr(b.type) ?? "anime",
      status: asStr(b.status),
      total: (b.total as number | null | undefined) ?? null,
    });
  });
}
