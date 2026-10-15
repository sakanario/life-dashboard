import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { getVault, markDirty } from "./index";
import { isIsoDate, todayIso } from "./dates";
import { doneLine, findDoneSection, journalPath, QUEST_DONE_TITLE } from "./journal-format";
import { parseMd, parseQuests } from "./parse";
import { safeResolve } from "./paths";
import type { HabitState, VaultIndex } from "./types";

/**
 * Satu-satunya pintu tulis ke vault (REQUIREMENTS §8):
 * edit per baris / per field, tulis atomik, antre per file, path selalu divalidasi.
 */

export class WriteError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

/* ===== antrean per file ===== */
// sengaja dibikin baru tiap modul dimuat: kunci nyangkut dari kode lama (HMR) tidak ikut kebawa
const LOCKS = new Map<string, Promise<void>>();
const LOCK_TIMEOUT = 10_000;

async function lock(rel: string): Promise<() => void> {
  const prev = LOCKS.get(rel) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const chained = prev.then(() => mine);
  LOCKS.set(rel, chained);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = await Promise.race([
    prev.then(() => true),
    new Promise<false>((r) => (timer = setTimeout(() => r(false), LOCK_TIMEOUT))),
  ]);
  clearTimeout(timer);
  if (!waited) {
    release();
    throw new WriteError(503, `File lagi sibuk: ${rel}. Coba lagi.`);
  }
  return () => {
    release();
    if (LOCKS.get(rel) === chained) LOCKS.delete(rel);
  };
}

/** Kunci beberapa file sekaligus, urut path biar tidak saling nunggu. */
async function withLocks<T>(rels: string[], fn: () => Promise<T>): Promise<T> {
  const releases: (() => void)[] = [];
  try {
    for (const r of [...new Set(rels)].sort()) releases.push(await lock(r));
    return await fn();
  } finally {
    releases.reverse().forEach((r) => r());
  }
}

/* ===== baca / tulis file ===== */
type Doc = { rel: string; abs: string; exists: boolean; eol: string; lines: string[] };

function resolveMd(rel: string) {
  const safe = safeResolve(rel);
  if (!safe || !safe.rel.toLowerCase().endsWith(".md")) throw new WriteError(400, `Path tidak valid: ${rel}`);
  return safe;
}

async function readDoc(rel: string): Promise<Doc> {
  const safe = resolveMd(rel);
  try {
    const text = await fs.readFile(safe.abs, "utf8");
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    return { rel: safe.rel, abs: safe.abs, exists: true, eol, lines: text.split(/\r?\n/) };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { rel: safe.rel, abs: safe.abs, exists: false, eol: "\n", lines: [] };
    throw e;
  }
}

const docText = (d: Doc) => d.lines.join(d.eol);

/** Tulis atomik: file sementara di folder yang sama → rename. */
async function writeDoc(d: Doc) {
  await fs.mkdir(path.dirname(d.abs), { recursive: true });
  const tmp = `${d.abs}.${process.pid}.${Date.now()}.ld-tmp`;
  await fs.writeFile(tmp, docText(d), "utf8");
  for (let i = 0; ; i++) {
    try {
      await fs.rename(tmp, d.abs);
      break;
    } catch (e) {
      // Windows: file lagi dibuka app lain (Obsidian/antivirus) → coba lagi sebentar
      const code = (e as NodeJS.ErrnoException).code;
      if (i < 5 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) {
        await new Promise((r) => setTimeout(r, 60 * (i + 1)));
        continue;
      }
      await fs.rm(tmp, { force: true });
      throw e;
    }
  }
  d.exists = true;
  markDirty();
}

/* ===== frontmatter per baris ===== */
function fmEnd(lines: string[]): number {
  if (lines[0]?.trim() !== "---") return -1;
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === "---") return i;
  return -1;
}

/** YAML scalar satu baris. Pakai tanda kutip kalau bisa kebaca beda (angka, bool, ada ':' / '#', dst). */
export function yamlScalar(v: string): string {
  const s = v.replace(/[\r\n]+/g, " ").trim();
  if (!s) return "";
  const risky =
    /^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(s) || /:\s|\s#|:$/.test(s) ||
    /^(true|false|yes|no|on|off|null|~)$/i.test(s) || /^[-+]?(\d|\.\d)/.test(s);
  return risky ? JSON.stringify(s) : s;
}

/** Ganti / tambah satu field frontmatter. `raw` = nilai YAML yang sudah jadi. Baris lain tidak disentuh. */
function setFmField(d: Doc, key: string, raw: string) {
  const line = raw ? `${key}: ${raw}` : `${key}:`;
  const end = fmEnd(d.lines);
  if (end < 0) {
    d.lines.unshift("---", line, "---");
    return;
  }
  const re = new RegExp(`^${key}\\s*:`);
  const i = d.lines.slice(1, end).findIndex((l) => re.test(l));
  if (i < 0) {
    d.lines.splice(end, 0, line);
    return;
  }
  const at = i + 1;
  // buang lanjutan nilai block-style (baris menjorok di bawahnya)
  let j = at + 1;
  while (j < end && /^\s+\S/.test(d.lines[j])) j++;
  d.lines.splice(at, j - at, line);
}

const fmOf = (d: Doc) => parseMd(docText(d)).fm;

/* ===== jurnal ===== */
async function ensureJournal(d: Doc, date: string) {
  if (!d.exists) {
    let tpl = `---${d.eol}date: {{date}}${d.eol}highlight:${d.eol}habits: {}${d.eol}---${d.eol}`;
    try {
      const t = await readDoc("_Templates/{{date}}.md");
      if (t.exists) tpl = docText(t);
    } catch {}
    d.lines = tpl.replace(/\{\{date\}\}/g, date).split(/\r?\n/);
  }
  const fm = fmOf(d);
  if (String(fm.date ?? "") !== date) setFmField(d, "date", date);
}

/** Rapikan akhir file: maksimal satu baris kosong di ujung. */
function trimEnd(d: Doc) {
  while (d.lines.length > 1 && d.lines[d.lines.length - 1].trim() === "" && d.lines[d.lines.length - 2].trim() === "") d.lines.pop();
  if (d.lines[d.lines.length - 1] !== "") d.lines.push("");
}

function addDoneLine(d: Doc, line: string): boolean {
  const sec = findDoneSection(d.lines);
  if (sec) {
    if (d.lines.slice(sec.start + 1, sec.end).some((l) => l.trim() === line)) return false;
    let at = sec.end;
    while (at > sec.start + 1 && d.lines[at - 1].trim() === "") at--;
    d.lines.splice(at, 0, line);
  } else {
    while (d.lines.length && d.lines[d.lines.length - 1].trim() === "") d.lines.pop();
    const body = d.lines.length > fmEnd(d.lines) + 1;
    d.lines.push(...(body ? [""] : []), `## ${QUEST_DONE_TITLE}`, line);
  }
  trimEnd(d);
  return true;
}

function removeDoneLine(d: Doc, line: string): boolean {
  const sec = findDoneSection(d.lines);
  if (!sec) return false;
  const idx = d.lines.findIndex((l, i) => i > sec.start && i < sec.end && l.trim() === line);
  if (idx < 0) return false;
  d.lines.splice(idx, 1);
  const s2 = findDoneSection(d.lines)!;
  if (!d.lines.slice(s2.start + 1, s2.end).some((l) => l.trim())) {
    let from = s2.start;
    while (from > fmEnd(d.lines) + 1 && d.lines[from - 1].trim() === "") from--;
    d.lines.splice(from, s2.end - from);
  }
  trimEnd(d);
  return true;
}

/** Body tanpa seksi Quest selesai, plus seksinya (buat ditaruh lagi di akhir). */
function journalParts(d: Doc) {
  const end = fmEnd(d.lines);
  const head = end >= 0 ? d.lines.slice(0, end + 1) : [];
  const body = end >= 0 ? d.lines.slice(end + 1) : d.lines;
  const sec = findDoneSection(body);
  const section = sec ? body.slice(sec.start, sec.end).filter((l, i, a) => i < a.length - 1 || l.trim()) : [];
  const rest = sec ? [...body.slice(0, sec.start), ...body.slice(sec.end)] : body;
  return { head, summary: rest.join("\n").trim(), section };
}

const norm = (s: string) => s.replace(/\r\n/g, "\n").trim();

export type HabitPatch = Record<string, HabitState | null>;

export async function saveJournal(
  date: string,
  input: { highlight?: string; summary?: string; habits?: HabitPatch; base?: { highlight?: string; summary?: string } },
) {
  if (!isIsoDate(date)) throw new WriteError(400, "Tanggal tidak valid");
  const v = await getVault();
  const rel = journalPath(date);
  return withLocks([rel], async () => {
    const d = await readDoc(rel);
    const existed = d.exists;
    const cur = d.exists ? { fm: fmOf(d), ...journalParts(d) } : { fm: {} as Record<string, unknown>, head: [], summary: "", section: [] as string[] };
    const curHighlight = String(cur.fm.highlight ?? "").trim();

    // konflik: field yang mau ditulis udah diubah dari luar sejak form dibuka
    if (input.base) {
      const clash =
        (input.highlight !== undefined && input.base.highlight !== undefined && norm(input.base.highlight) !== curHighlight) ||
        (input.summary !== undefined && input.base.summary !== undefined && norm(input.base.summary) !== norm(cur.summary));
      if (clash) throw new WriteError(409, "Jurnal ini berubah dari luar sejak dibuka", { highlight: curHighlight, summary: cur.summary });
    }

    const nothing =
      !d.exists && !input.highlight?.trim() && !input.summary?.trim() && !Object.values(input.habits ?? {}).some(Boolean);
    if (nothing) return { file: rel, created: false, changed: false };

    await ensureJournal(d, date);

    if (input.highlight !== undefined) setFmField(d, "highlight", yamlScalar(input.highlight));

    if (input.habits) {
      const fm = fmOf(d);
      const map: Record<string, HabitState> = {};
      if (fm.habits && typeof fm.habits === "object" && !Array.isArray(fm.habits))
        for (const [k, val] of Object.entries(fm.habits as Record<string, unknown>)) if (val === "done" || val === "missed") map[k] = val;
      for (const [k, val] of Object.entries(input.habits)) {
        if (!/^[\w-]+$/.test(k)) throw new WriteError(400, `Habit tidak valid: ${k}`);
        if (val) map[k] = val;
        else delete map[k];
      }
      const order = [...v.habits.map((h) => h.id), ...Object.keys(map)];
      const keys = [...new Set(order)].filter((k) => map[k]);
      setFmField(d, "habits", keys.length ? `{ ${keys.map((k) => `${k}: ${map[k]}`).join(", ")} }` : "{}");
    }

    if (input.summary !== undefined) {
      const { head, section } = journalParts(d);
      const sum = norm(input.summary).split("\n");
      d.lines = [...head, ...(sum.join("").trim() ? sum : []), ...(section.length ? ["", ...section] : [])];
      trimEnd(d);
    }

    await writeDoc(d);
    return { file: rel, created: !existed, changed: true };
  });
}

/* ===== quest ===== */
function questCtx(v: VaultIndex, file: string) {
  const proj = v.projects.find((p) => file.startsWith(p.dir + "/"));
  if (proj?.isArchived) throw new WriteError(403, "Proyek diarsip (read-only)");
  const goal = file.startsWith("Goals/") ? v.goals.find((x) => x.file === file) ?? null : null;
  return {
    proj: proj ?? null,
    label: proj ? proj.title : goal ? goal.title : null,
  };
}

const QUEST_LINE = /^(\s*[-*+] \[)([ xX])(\][ \t]+)(.*?)\s*$/;
const DONE_TAG = /\s+done:\d{4}-\d{2}-\d{2}\b/g;

/** Cari baris quest: di nomor baris yang dikirim, atau (kalau sudah geser) cari ulang berdasarkan teks. */
function locateQuest(d: Doc, file: string, line: number, text: string): number {
  const at = (i: number) => (d.lines[i] !== undefined ? parseQuests(file, d.lines[i], { source: "other", project: null, goal: null })[0] : undefined);
  if (at(line - 1)?.text === text) return line - 1;
  const hits = d.lines.map((_, i) => i).filter((i) => at(i)?.text === text);
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return hits.sort((a, b) => Math.abs(a - (line - 1)) - Math.abs(b - (line - 1)))[0];
  throw new WriteError(409, "Quest ini udah berubah atau pindah. Muat ulang dulu.");
}

async function bumpUpdated(rel: string, today: string) {
  const d = await readDoc(rel);
  if (!d.exists || String(fmOf(d).updated ?? "") === today) return;
  setFmField(d, "updated", today);
  await writeDoc(d);
}

export async function toggleQuest(id: string, input: { text: string; done: boolean }) {
  const cut = id.lastIndexOf(":");
  const file = id.slice(0, cut), line = Number(id.slice(cut + 1));
  if (cut < 1 || !Number.isInteger(line) || line < 1) throw new WriteError(400, "ID quest tidak valid");
  const rel = resolveMd(file).rel;
  const v = await getVault();
  const { proj, label } = questCtx(v, rel);
  const today = todayIso();

  // kunci file quest + README proyeknya sekaligus (bisa file yang sama → withLocks udah dedupe)
  return withLocks(proj ? [rel, proj.file] : [rel], async () => {
    const d = await readDoc(rel);
    if (!d.exists) throw new WriteError(404, "File quest tidak ketemu");
    const i = locateQuest(d, rel, line, input.text);
    const m = QUEST_LINE.exec(d.lines[i])!;
    const wasDone = m[2] !== " ";
    const oldDoneAt = /done:(\d{4}-\d{2}-\d{2})/.exec(m[4])?.[1] ?? null;
    const q = parseQuests(rel, d.lines[i], { source: "other", project: null, goal: null })[0];
    const entry = doneLine(q.text, label);
    let journal: { file: string; action: "added" | "removed" | "not-found" | "none" } = { file: "", action: "none" };

    if (wasDone !== input.done) {
      const rest = m[4].replace(DONE_TAG, "").trimEnd();
      d.lines[i] = `${m[1]}${input.done ? "x" : " "}${m[3]}${rest}${input.done ? ` done:${today}` : ""}`;
      // README proyek: field updated ikut ditulis bareng (cuma ganti baris di frontmatter, nomor baris quest tetap)
      if (proj?.file === rel && String(fmOf(d).updated ?? "") !== today) setFmField(d, "updated", today);
      await writeDoc(d);

      // catat / hapus di jurnal tanggal selesainya (REQUIREMENTS §5.1)
      const jDate = input.done ? today : oldDoneAt;
      if (jDate) {
        const jrel = journalPath(jDate);
        journal = await withLocks([jrel], async () => {
          const j = await readDoc(jrel);
          if (input.done) {
            await ensureJournal(j, jDate);
            const added = addDoneLine(j, entry);
            if (added || !j.exists) await writeDoc(j);
            return { file: jrel, action: "added" as const };
          }
          if (!j.exists) return { file: jrel, action: "not-found" as const };
          const removed = removeDoneLine(j, entry);
          if (removed) await writeDoc(j);
          return { file: jrel, action: removed ? ("removed" as const) : ("not-found" as const) };
        });
      }
      if (proj && proj.file !== rel) await bumpUpdated(proj.file, today); // README udah kekunci di atas
    }
    return { id: `${rel}:${i + 1}`, file: rel, line: i + 1, done: input.done, doneAt: input.done ? today : null, journal };
  });
}

/** Tambah quest di akhir seksi "## Quest" (Uncategorize atau README proyek). */
export async function addQuest(input: { text: string; project: string | null }) {
  const text = input.text.replace(/[\r\n]+/g, " ").trim();
  if (!text) throw new WriteError(400, "Teks quest kosong");
  if (text.length > 500) throw new WriteError(400, "Teks quest kepanjangan");
  const v = await getVault();
  let rel = "Uncategorize.md";
  if (input.project) {
    const p = v.projects.find((x) => x.slug === input.project);
    if (!p) throw new WriteError(404, "Proyek tidak ketemu");
    if (p.isArchived) throw new WriteError(403, "Proyek diarsip (read-only)");
    rel = p.file;
  }
  const today = todayIso();
  return withLocks([rel], async () => {
    const d = await readDoc(rel);
    if (!d.exists) d.lines = ["---", "title: Uncategorize", "---", ""];
    // frontmatter duluan, biar nomor baris quest yang dibalikin tidak geser
    if (input.project) setFmField(d, "updated", today);
    const line = `- [ ] ${text}`;
    const h = d.lines.findIndex((l) => /^##[ \t]+Quest[ \t]*$/i.test(l));
    let at: number;
    if (h < 0) {
      while (d.lines.length && d.lines[d.lines.length - 1].trim() === "") d.lines.pop();
      d.lines.push("", "## Quest", line, "");
      at = d.lines.length - 2;
    } else {
      let end = h + 1;
      while (end < d.lines.length && !/^#{1,2}[ \t]+\S/.test(d.lines[end])) end++;
      at = end;
      while (at > h + 1 && d.lines[at - 1].trim() === "") at--;
      d.lines.splice(at, 0, line);
      // jaga jarak satu baris kosong sebelum heading berikutnya
      if (d.lines[at + 1] !== undefined && /^#{1,2}[ \t]+\S/.test(d.lines[at + 1])) d.lines.splice(at + 1, 0, "");
    }
    await writeDoc(d);
    return { id: `${rel}:${at + 1}`, file: rel, line: at + 1 };
  });
}
