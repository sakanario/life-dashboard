import matter from "gray-matter";
import { CORE_SCHEMA, load } from "js-yaml";
import type { Quest, QuestSource } from "./types";

/** CORE_SCHEMA: tanggal tetap string ("2026-10-15"), bukan objek Date. */
const MATTER_OPTS = {
  engines: { yaml: (s: string) => (load(s, { schema: CORE_SCHEMA }) ?? {}) as object },
};

export function parseMd(raw: string): { fm: Record<string, unknown>; body: string } {
  try {
    const m = matter(raw, MATTER_OPTS);
    return { fm: (m.data ?? {}) as Record<string, unknown>, body: m.content };
  } catch {
    // frontmatter rusak: anggap seluruh isi body, jangan bikin index gagal
    return { fm: {}, body: raw };
  }
}

/* ---------- akses frontmatter yang toleran ---------- */
export const str = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v).trim() || null;
export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : typeof v === "string" && v.trim() ? [v.trim()] : [];

/* ---------- quest ---------- */
const QUEST_RE = /^(\s*)[-*+] \[([ xX])\][ \t]+(.*?)\s*$/;
const TAG_RE = /(^|\s)@([\p{L}\p{N}_-]+)/gu;

/** Deskripsi goal = teks sebelum milestone pertama atau heading "## Quest" (yang ditambah app). */
export const GOAL_DESC_END = /^\s*[-*+] \[[ xX]\]|^##\s+Quest\b/im;
const DONE_RE = /(^|\s)done:(\d{4}-\d{2}-\d{2})\b/;

export function parseQuests(
  file: string,
  raw: string,
  ctx: { source: QuestSource; project: string | null; goal: string | null },
): Quest[] {
  const out: Quest[] = [];
  const lines = raw.split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) inFence = !inFence;
    if (inFence) continue;
    const m = QUEST_RE.exec(l);
    if (!m) continue;
    const body = m[3];
    const tags = [...body.matchAll(TAG_RE)].map((x) => x[2]);
    const doneAt = DONE_RE.exec(body)?.[2] ?? null;
    const text = inlinePlain(body.replace(DONE_RE, " ").replace(TAG_RE, " ")).replace(/\s+/g, " ").trim();
    const indent = m[1].replace(/\t/g, "  ").length;
    out.push({
      id: `${file}:${i + 1}`,
      file,
      line: i + 1,
      text: text || body,
      raw: l,
      done: m[2] !== " ",
      doneAt,
      tags,
      depth: Math.floor(indent / 2),
      ...ctx,
    });
  }
  return out;
}

/* ---------- teks polos dari markdown (buat ringkasan kartu) ---------- */
/** Penanda format inline: **tebal**, __tebal__, ~~coret~~, `kode`, *miring*. Underscore tunggal dibiarin (`_private`). */
const INLINE_MD = /\*\*|__|~~|`|(?<![\w*])\*(?=\S)|(?<=\S)\*(?![\w*])/g;

/** Teks quest buat ditampilin: tanpa penanda format & kurung wikilink. */
export const inlinePlain = (s: string) =>
  s.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]|#]+)(?:#[^\]]*)?\]\]/g, "$1").replace(INLINE_MD, "");
export function plain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[\[[^\]]*\]\]/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]|#]+)(?:#[^\]]*)?\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\|?[\s:|-]+\|?$/.test(l) && l !== "---")
    .map((l) =>
      l
        .replace(/^#{1,6}\s+/, "")
        .replace(/^>\s?/, "")
        .replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, "")
        .replace(/^\|\s*|\s*\|$/g, "")
        .replace(/\s*\|\s*/g, " · ")
        .replace(INLINE_MD, ""),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export const wordCount = (s: string) => (s.trim().match(/\S+/g) || []).length;

export const bodyTags = (s: string) => [...new Set([...s.matchAll(TAG_RE)].map((x) => x[2].toLowerCase()))];
