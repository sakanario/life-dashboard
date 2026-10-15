import fs from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import sharp from "sharp";
import { IMAGE_EXT, safeResolve } from "@/lib/vault/paths";

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
};

/** Lebar yang boleh diminta lewat `w` (dibulatkan ke atas), biar cache ga meledak. */
const WIDTHS = [160, 320, 480, 640, 800, 1200, 1600];
const RESIZABLE = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// cache hasil resize di memori: key = path|mtime|lebar
const g = globalThis as unknown as { __assetCache?: Map<string, Uint8Array> };
const CACHE = (g.__assetCache ??= new Map());
const CACHE_MAX = 80;

/** Cuma gambar, cuma di dalam vault, _private/ & .obsidian/ ditolak. `w` = kecilin (webp), ga pernah dibesarin. */
export async function GET(req: Request) {
  await connection();
  const q = new URL(req.url).searchParams;
  const safe = safeResolve(q.get("path") ?? "");
  const ext = safe ? path.extname(safe.abs).toLowerCase() : "";
  if (!safe || !IMAGE_EXT.has(ext)) return new Response("not found", { status: 404 });
  const wReq = Number(q.get("w"));
  const w = RESIZABLE.has(ext) && wReq > 0 ? (WIDTHS.find((x) => x >= wReq) ?? WIDTHS[WIDTHS.length - 1]) : 0;
  try {
    const headers: Record<string, string> = {
      "content-type": MIME[ext],
      // URL cover ikut bawa ?v=mtime, jadi aman di-cache lama; yang lain sebentar aja
      "cache-control": q.has("v") ? "private, max-age=31536000, immutable" : "private, max-age=60",
      ...(ext === ".svg" ? { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
    };
    if (w) {
      const st = await fs.stat(safe.abs);
      const key = `${safe.rel}|${st.mtimeMs}|${w}`;
      let out = CACHE.get(key);
      if (!out) {
        out = new Uint8Array(await sharp(await fs.readFile(safe.abs)).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer());
        CACHE.set(key, out);
        if (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value!);
      }
      return new Response(out, { headers: { ...headers, "content-type": "image/webp" } });
    }
    const buf = await fs.readFile(safe.abs);
    return new Response(new Uint8Array(buf), { headers });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
