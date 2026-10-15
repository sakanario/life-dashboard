import fs from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import { IMAGE_EXT, safeResolve } from "@/lib/vault/paths";

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
};

/** Cuma gambar, cuma di dalam vault, _private/ & .obsidian/ ditolak. (Resize `w` nyusul bareng upload cover di Fase 6.) */
export async function GET(req: Request) {
  await connection();
  const safe = safeResolve(new URL(req.url).searchParams.get("path") ?? "");
  const ext = safe ? path.extname(safe.abs).toLowerCase() : "";
  if (!safe || !IMAGE_EXT.has(ext)) return new Response("not found", { status: 404 });
  try {
    const buf = await fs.readFile(safe.abs);
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": MIME[ext],
        "cache-control": "private, max-age=60",
        ...(ext === ".svg" ? { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
