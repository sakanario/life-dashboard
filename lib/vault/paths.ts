import path from "node:path";

/** Folder yang tidak pernah di-index, dicari, atau dilayani app. */
export const EXCLUDED_DIRS = new Set([".git", ".obsidian", "_private", ".trash", "node_modules"]);

export const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

/** App cuma peduli .md + gambar; file lain (.kra, autosave, temp, dll) ga dipantau/di-index. */
export function isVaultFile(p: string): boolean {
  const ext = path.extname(p).toLowerCase();
  return ext === ".md" || IMAGE_EXT.has(ext);
}

export function vaultRoot(): string {
  const v = process.env.VAULT_PATH;
  if (!v) throw new Error("VAULT_PATH belum diisi di .env");
  return path.resolve(v);
}

/** Path vault ditulis pakai "/" di semua tempat (id quest, API, UI). */
export const toPosix = (p: string) => p.split(path.sep).join("/");

export function isExcluded(rel: string): boolean {
  return rel.split("/").some((part) => EXCLUDED_DIRS.has(part));
}

/**
 * Ubah path relatif dari client jadi path absolut yang aman.
 * Null kalau keluar dari vault atau masuk folder yang dikecualikan.
 */
export function safeResolve(rel: string): { abs: string; rel: string } | null {
  if (!rel || rel.includes("\0")) return null;
  const root = vaultRoot();
  const abs = path.resolve(root, rel.replace(/^[/\\]+/, ""));
  const back = path.relative(root, abs);
  if (!back || back.startsWith("..") || path.isAbsolute(back)) return null;
  const posix = toPosix(back);
  if (isExcluded(posix)) return null;
  return { abs, rel: posix };
}
