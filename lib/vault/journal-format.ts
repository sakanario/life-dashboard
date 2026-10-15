/**
 * Format jurnal yang dipakai bareng parser & writer (REQUIREMENTS §5.2).
 * Seksi "## Quest selesai" dikelola app, selalu di akhir file, bukan bagian ringkasan.
 */

export const QUEST_DONE_TITLE = "Quest selesai";
const HEADING_RE = /^##[ \t]+Quest selesai[ \t]*$/i;
const ANY_H12_RE = /^#{1,2}[ \t]+\S/;

export const journalPath = (date: string) => `Journal/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.md`;

/** "- Ganti password DB · JIP" (tanpa label buat Uncategorize). */
export const doneLine = (text: string, label: string | null) => `- ${text}${label ? ` · ${label}` : ""}`;

/** Cari rentang baris seksi Quest selesai: [heading, end) — end = heading H1/H2 berikutnya atau akhir. */
export function findDoneSection(lines: string[]): { start: number; end: number } | null {
  const start = lines.findIndex((l) => HEADING_RE.test(l));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !ANY_H12_RE.test(lines[end])) end++;
  return { start, end };
}

/** Pisahin body jurnal jadi ringkasan (teks user) + daftar quest selesai. */
export function splitJournalBody(body: string): { summary: string; questsDone: string[] } {
  const lines = body.split(/\r?\n/);
  const sec = findDoneSection(lines);
  if (!sec) return { summary: body.trim(), questsDone: [] };
  const questsDone = lines
    .slice(sec.start + 1, sec.end)
    .map((l) => /^\s*[-*+][ \t]+(.+?)\s*$/.exec(l)?.[1])
    .filter((x): x is string => !!x);
  const summary = [...lines.slice(0, sec.start), ...lines.slice(sec.end)].join("\n").trim();
  return { summary, questsDone };
}
