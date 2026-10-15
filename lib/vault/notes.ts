import "server-only";
import path from "node:path";
import { getVault } from "./index";
import { IMAGE_EXT } from "./paths";
import type { VaultIndex } from "./types";

export type TreeNode = { name: string; path: string; dir: boolean; children?: TreeNode[] };

const TOP_ORDER = ["Uncategorize.md", "Habits.md", "Goals", "Projects", "Content", "Journal", "Watchlist", "Knowledge", "Archive", "_Templates"];

export function buildTree(v: VaultIndex): TreeNode[] {
  const root: TreeNode = { name: "", path: "", dir: true, children: [] };
  for (const f of v.files) {
    const parts = f.path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      let child = node.children!.find((c) => c.name === part && c.dir === !last);
      if (!child) {
        child = { name: part, path: parts.slice(0, i + 1).join("/"), dir: !last, ...(last ? {} : { children: [] }) };
        node.children!.push(child);
      }
      node = child;
    });
  }
  const sort = (n: TreeNode, top: boolean) => {
    n.children?.sort((a, b) => {
      if (top) {
        const ia = TOP_ORDER.indexOf(a.name), ib = TOP_ORDER.indexOf(b.name);
        if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      }
      return a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true });
    });
    n.children?.forEach((c) => sort(c, false));
  };
  sort(root, true);
  return root.children!;
}

/**
 * Cari target wikilink kayak Obsidian: nama file unik di mana pun, atau akhiran path.
 * Kalau ada beberapa, pilih yang paling deket sama file asal.
 */
export function resolveLink(v: VaultIndex, target: string, from: string): string | null {
  const t = target.trim().replace(/\\/g, "/").replace(/^\.?\//, "");
  if (!t) return null;
  const lower = t.toLowerCase();
  const base = lower.split("/").pop()!;
  const cands = (v.byBasename.get(base) ?? v.byBasename.get(base + ".md") ?? []).filter((p) => {
    const pl = p.toLowerCase();
    return !lower.includes("/") || pl.endsWith(lower) || pl.endsWith(lower + ".md");
  });
  const pool = cands.length ? cands : lower.includes("/") ? v.byBasename.get(base) ?? [] : [];
  if (!pool.length) return null;
  const dir = path.posix.dirname(from);
  const score = (p: string) => {
    const a = dir.split("/"), b = p.split("/");
    let i = 0;
    while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
    return i;
  };
  return [...pool].sort((a, b) => score(b) - score(a) || a.length - b.length)[0];
}

export const isImage = (p: string) => IMAGE_EXT.has(path.extname(p).toLowerCase());

const noteHref = (p: string) => `/notes?path=${encodeURIComponent(p)}`;
const assetHref = (p: string) => `/api/assets?path=${encodeURIComponent(p)}`;

/** Ubah sintaks khas Obsidian jadi markdown biasa sebelum dirender. */
export function preprocessMarkdown(v: VaultIndex, md: string, from: string): string {
  const dir = path.posix.dirname(from);
  return md
    .split(/(```[\s\S]*?```)/g)
    .map((chunk, i) =>
      i % 2
        ? chunk
        : chunk
            // ![[gambar.png]] / ![[gambar.png|300]]
            .replace(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, (all, t: string) => {
              const r = resolveLink(v, t, from);
              return r && isImage(r) ? `![${t}](${assetHref(r)})` : r ? `[${t}](${noteHref(r)})` : `*${t}* (file tidak ketemu)`;
            })
            // [[Catatan#Bagian|label]]
            .replace(/\[\[([^\]|#]*)(#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (all, t: string, _h: string | undefined, label: string | undefined) => {
              const shown = (label ?? (t || (_h ?? "").slice(1))).trim();
              const r = t ? resolveLink(v, t, from) : from;
              return r ? `[${shown}](${isImage(r) ? assetHref(r) : noteHref(r)}#wl)` : `[${shown}](#missing)`;
            })
            // gambar markdown relatif: ![](assets/x.png)
            .replace(/!\[([^\]]*)\]\((?!https?:|\/|#|data:)([^)\s]+)\)/g, (all, alt: string, p: string) => {
              const rel = path.posix.normalize(path.posix.join(dir, decodeURI(p)));
              return `![${alt}](${assetHref(rel)})`;
            }),
    )
    .join("");
}

export async function getNotes(sel: string | null, q: string | null) {
  const v = await getVault();
  const tree = buildTree(v);
  let doc: { path: string; kind: "md" | "image" | "other"; md?: string; fm?: Record<string, unknown> } | null = null;
  if (sel) {
    const f = v.files.find((x) => x.path === sel);
    if (f) {
      const d = v.docs.get(f.path);
      doc = d
        ? { path: f.path, kind: "md", md: preprocessMarkdown(v, d.body, f.path), fm: d.fm }
        : { path: f.path, kind: isImage(f.path) ? "image" : "other" };
    }
  }
  return { tree, doc, results: q ? search(v, q) : null, selected: sel };
}

export function search(v: VaultIndex, q: string, limit = 60) {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const out: { path: string; line: number; snippet: string }[] = [];
  for (const d of v.docs.values()) {
    const lines = d.raw.split(/\r?\n/);
    const nameHit = d.path.toLowerCase().includes(needle);
    let hit = false;
    for (let i = 0; i < lines.length && out.length < limit; i++) {
      if (lines[i].toLowerCase().includes(needle)) {
        out.push({ path: d.path, line: i + 1, snippet: lines[i].trim().slice(0, 200) });
        hit = true;
        break; // satu hasil per file biar ringkas
      }
    }
    if (!hit && nameHit && out.length < limit) out.push({ path: d.path, line: 1, snippet: "(cocok di nama file)" });
  }
  return out;
}
