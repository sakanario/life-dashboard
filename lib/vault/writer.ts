import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getVault, markDirty, withWatcherPaused } from "./index";
import { isIsoDate, todayIso } from "./dates";
import { doneLine, findDoneSection, journalPath, QUEST_DONE_TITLE } from "./journal-format";
import { PUBLISHED_STAGES, STAGE_KEYS } from "./content-format";
import { GOAL_DESC_END, num, parseMd, parseQuests } from "./parse";
import { safeResolve } from "./paths";
import { clampCoverPos, COVER_DIR, COVER_MAX_BYTES, COVER_MAX_WIDTH, coverPosValue, WATCH_STATUS, WATCH_TYPES, type CoverPos } from "./watch-format";
import type { HabitState, ProjectStatus, VaultIndex } from "./types";

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
  await writeAtomic(d.abs, docText(d));
  d.exists = true;
}

async function writeAtomic(abs: string, data: string | Uint8Array) {
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid}.${Date.now()}.ld-tmp`;
  await fs.writeFile(tmp, data, typeof data === "string" ? "utf8" : undefined);
  for (let i = 0; ; i++) {
    try {
      await fs.rename(tmp, abs);
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

/** Hapus satu field frontmatter (plus lanjutan block-style di bawahnya). */
function removeFmField(d: Doc, key: string) {
  const end = fmEnd(d.lines);
  if (end < 0) return;
  const re = new RegExp(`^${key}\\s*:`);
  const i = d.lines.slice(1, end).findIndex((l) => re.test(l));
  if (i < 0) return;
  let j = i + 2;
  while (j < end && /^\s+\S/.test(d.lines[j])) j++;
  d.lines.splice(i + 1, j - i - 1);
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
      // gaya file dijaga: kalau ada baris kosong setelah frontmatter, biarin tetap ada
      const gap = head.length && d.lines.length > head.length + 1 && d.lines[head.length].trim() === "" ? [""] : [];
      d.lines = [...head, ...(sum.join("").trim() ? [...gap, ...sum] : []), ...(section.length ? ["", ...section] : [])];
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

/** Tambah quest di akhir seksi "## Quest" (Uncategorize, README proyek, atau file goal). */
export async function addQuest(input: { text: string; project: string | null; goal?: string | null }) {
  const text = cleanQuestText(input.text);
  const v = await getVault();
  let rel = "Uncategorize.md";
  if (input.project) {
    const p = v.projects.find((x) => x.slug === input.project);
    if (!p) throw new WriteError(404, "Proyek tidak ketemu");
    if (p.isArchived) throw new WriteError(403, "Proyek diarsip (read-only)");
    rel = p.file;
  } else if (input.goal) {
    const g = v.goals.find((x) => x.slug === input.goal);
    if (!g) throw new WriteError(404, "Goal tidak ketemu");
    rel = g.file;
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

/* ===== kelola quest (Fase 3): edit teks, pindah urutan, hapus ===== */

function cleanQuestText(raw: string) {
  const text = raw.replace(/[\r\n]+/g, " ").trim();
  if (!text) throw new WriteError(400, "Teks quest kosong");
  if (text.length > 500) throw new WriteError(400, "Teks quest kepanjangan");
  return text;
}

const indentOf = (l: string) => /^\s*/.exec(l)![0].replace(/\t/g, "  ").length;
const isQuestLine = (l: string | undefined) => l !== undefined && QUEST_LINE.test(l);

/** Akhir blok quest [i, end): baris quest + baris di bawahnya yang lebih menjorok (subquest / catatan). */
function blockEnd(lines: string[], i: number) {
  const ind = indentOf(lines[i]);
  let j = i + 1;
  while (j < lines.length && lines[j].trim() !== "" && indentOf(lines[j]) > ind) j++;
  return j;
}

/** Awal blok quest sejajar (indentasi sama) tepat di atasnya, atau -1 kalau ga ada. */
function prevSibling(lines: string[], i: number) {
  const ind = indentOf(lines[i]);
  let k = i - 1;
  while (k >= 0 && lines[k].trim() !== "" && indentOf(lines[k]) > ind) k--;
  return k >= 0 && isQuestLine(lines[k]) && indentOf(lines[k]) === ind ? k : -1;
}

/** Buka file quest (dikunci + cek arsip), cari barisnya, jalanin `fn`, tulis. README proyek ikut di-bump `updated`. */
async function withQuest<T>(id: string, text: string, fn: (d: Doc, i: number) => T) {
  const cut = id.lastIndexOf(":");
  const file = id.slice(0, cut), line = Number(id.slice(cut + 1));
  if (cut < 1 || !Number.isInteger(line) || line < 1) throw new WriteError(400, "ID quest tidak valid");
  const rel = resolveMd(file).rel;
  const v = await getVault();
  const { proj } = questCtx(v, rel);
  const today = todayIso();
  return withLocks(proj ? [rel, proj.file] : [rel], async () => {
    const d = await readDoc(rel);
    if (!d.exists) throw new WriteError(404, "File quest tidak ketemu");
    // frontmatter duluan: kalau field `updated` baru ditambah, barisnya geser & locateQuest cari ulang pakai teks
    if (proj?.file === rel && String(fmOf(d).updated ?? "") !== today) setFmField(d, "updated", today);
    const out = fn(d, locateQuest(d, rel, line, text));
    await writeDoc(d);
    if (proj && proj.file !== rel) await bumpUpdated(proj.file, today);
    return out;
  });
}

/** Ganti teks quest. Status centang & `done:` dipertahankan. */
export async function editQuest(id: string, input: { text: string; newText: string }) {
  const next = cleanQuestText(input.newText).replace(DONE_TAG, "").trim();
  if (!next) throw new WriteError(400, "Teks quest kosong");
  return withQuest(id, input.text, (d, i) => {
    const m = QUEST_LINE.exec(d.lines[i])!;
    const done = /(?:^|\s)(done:\d{4}-\d{2}-\d{2})\b/.exec(m[4])?.[1];
    d.lines[i] = `${m[1]}${m[2]}${m[3]}${next}${done ? " " + done : ""}`;
    return { id: `${d.rel}:${i + 1}`, file: d.rel, line: i + 1 };
  });
}

/** Tukar quest (beserta subquest-nya) dengan quest sejajar di atas / bawahnya. */
export async function moveQuest(id: string, input: { text: string; dir: "up" | "down" }) {
  return withQuest(id, input.text, (d, i) => {
    const L = d.lines;
    let a: number, b: number; // a = awal blok atas, b = awal blok bawah (nempel langsung)
    if (input.dir === "up") {
      a = prevSibling(L, i);
      b = i;
      if (a < 0 || blockEnd(L, a) !== b) throw new WriteError(409, "Udah paling atas");
    } else {
      a = i;
      b = blockEnd(L, i);
      if (!isQuestLine(L[b]) || indentOf(L[b]) !== indentOf(L[i])) throw new WriteError(409, "Udah paling bawah");
    }
    const end = blockEnd(L, b);
    const upper = L.slice(a, b), lower = L.slice(b, end);
    L.splice(a, end - a, ...lower, ...upper);
    const at = input.dir === "up" ? a : a + lower.length;
    return { id: `${d.rel}:${at + 1}`, file: d.rel, line: at + 1 };
  });
}

/** Hapus quest beserta subquest-nya. Baris di jurnal "Quest selesai" tidak disentuh. */
export async function deleteQuest(id: string, input: { text: string }) {
  return withQuest(id, input.text, (d, i) => {
    const removed = d.lines.splice(i, blockEnd(d.lines, i) - i);
    return { file: d.rel, line: i + 1, removed: removed.length };
  });
}

/* ===== proyek & goal ===== */

const EDITABLE_STATUS: ProjectStatus[] = ["idea", "active", "paused", "done"];

function findProject(v: VaultIndex, slug: string) {
  const p = v.projects.find((x) => x.slug === slug);
  if (!p) throw new WriteError(404, "Proyek tidak ketemu");
  return p;
}

export async function setProjectStatus(slug: string, status: string) {
  if (!EDITABLE_STATUS.includes(status as ProjectStatus)) throw new WriteError(400, `Status tidak valid: ${status}`);
  const p = findProject(await getVault(), slug);
  if (p.isArchived) throw new WriteError(403, "Proyek diarsip (read-only)");
  return withLocks([p.file], async () => {
    const d = await readDoc(p.file);
    if (!d.exists) throw new WriteError(404, "README proyek tidak ketemu");
    setFmField(d, "status", status);
    setFmField(d, "updated", todayIso());
    await writeDoc(d);
    return { file: p.file, status };
  });
}

const slugify = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const exists = (abs: string) => fs.stat(abs).then(() => true, () => false);

export async function createProject(input: { title: string; type: string; status?: string; goal?: string | null; desc?: string }) {
  const title = input.title.replace(/[\r\n]+/g, " ").trim();
  if (!title) throw new WriteError(400, "Judul proyek kosong");
  if (title.length > 120) throw new WriteError(400, "Judul kepanjangan");
  if (input.type !== "personal" && input.type !== "work") throw new WriteError(400, "Type harus personal / work");
  const status = input.status || "active";
  if (!EDITABLE_STATUS.includes(status as ProjectStatus)) throw new WriteError(400, `Status tidak valid: ${status}`);
  const v = await getVault();
  if (input.goal && !v.goals.some((g) => g.slug === input.goal)) throw new WriteError(404, "Goal tidak ketemu");
  const base = slugify(title) || "proyek";
  const taken = async (s: string) =>
    v.projects.some((p) => p.slug === s) || (await exists(safeResolve(`Projects/${s}`)!.abs)) || (await exists(safeResolve(`Archive/Projects/${s}`)!.abs));
  let slug = base;
  for (let n = 2; await taken(slug); n++) slug = `${base}-${n}`;
  const rel = `Projects/${slug}/README.md`;
  return withLocks([rel], async () => {
    const d = await readDoc(rel);
    if (d.exists) throw new WriteError(409, "Proyek udah ada");
    const desc = (input.desc ?? "").replace(/\r\n/g, "\n").trim();
    d.lines = [
      "---",
      `title: ${yamlScalar(title)}`,
      `type: ${input.type}`,
      `status: ${status}`,
      ...(input.goal ? [`goal: ${input.goal}`] : []),
      "tags: []",
      `updated: ${todayIso()}`,
      "---",
      ...(desc ? [...desc.split("\n"), ""] : []),
      "## Quest",
      "",
    ];
    await writeDoc(d);
    return { slug, file: rel };
  });
}

/** Pindah folder proyek (Projects/ ⇄ Archive/Projects/). Rename dicoba ulang kalau lagi dipegang app lain. */
async function moveDir(fromRel: string, toRel: string) {
  const from = safeResolve(fromRel), to = safeResolve(toRel);
  if (!from || !to) throw new WriteError(400, "Path tidak valid");
  if (await exists(to.abs)) throw new WriteError(409, `Folder tujuan udah ada: ${toRel}/`);
  await fs.mkdir(path.dirname(to.abs), { recursive: true });
  await withWatcherPaused([fromRel, toRel], async () => {
    for (let i = 0; ; i++) {
      try {
        await fs.rename(from.abs, to.abs);
        return;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (i < 6 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) {
          await new Promise((r) => setTimeout(r, 100 * (i + 1)));
          continue;
        }
        throw new WriteError(409, `Folder ga bisa dipindah (${code ?? "error"}). Mungkin lagi dibuka di Obsidian / Explorer.`);
      }
    }
  });
}

/** Arsip: status archived + archived: tanggal, lalu folder pindah ke Archive/Projects/. */
export async function archiveProject(slug: string) {
  const p = findProject(await getVault(), slug);
  if (p.isArchived) throw new WriteError(409, "Proyek udah diarsip");
  const to = `Archive/Projects/${slug}`;
  return withLocks([p.file, `${to}/README.md`], async () => {
    const d = await readDoc(p.file);
    if (!d.exists) throw new WriteError(404, "README proyek tidak ketemu");
    const before = [...d.lines];
    const today = todayIso();
    setFmField(d, "status", "archived");
    setFmField(d, "archived", today);
    setFmField(d, "updated", today);
    await writeDoc(d);
    try {
      await moveDir(p.dir, to);
    } catch (e) {
      d.lines = before; // folder gagal dipindah → frontmatter dibalikin
      await writeDoc(d);
      throw e;
    }
    return { slug, from: `${p.dir}/`, to: `${to}/`, prevStatus: p.status };
  });
}

/** Pulihkan: folder balik ke Projects/, status jadi `status` (default paused), field archived dihapus. */
export async function restoreProject(slug: string, status = "paused") {
  if (!EDITABLE_STATUS.includes(status as ProjectStatus)) throw new WriteError(400, `Status tidak valid: ${status}`);
  const p = findProject(await getVault(), slug);
  if (!p.isArchived) throw new WriteError(409, "Proyek ga lagi diarsip");
  const to = `Projects/${slug}`;
  const file = `${to}/README.md`;
  return withLocks([p.file, file], async () => {
    await moveDir(p.dir, to);
    const d = await readDoc(file);
    if (d.exists) {
      setFmField(d, "status", status);
      removeFmField(d, "archived");
      setFmField(d, "updated", todayIso());
      await writeDoc(d);
    }
    return { slug, from: `${p.dir}/`, to: `${to}/`, status };
  });
}

/** Hapus proyek: folder dipindah ke Archive/Deleted/Projects/ (bisa diurungkan), ga dihapus permanen. */
export async function deleteProject(slug: string) {
  const p = findProject(await getVault(), slug);
  let to = `Archive/Deleted/Projects/${slug}`;
  for (let n = 2; await exists(safeResolve(to)!.abs); n++) to = `Archive/Deleted/Projects/${slug}-${n}`;
  return withLocks([p.file, `${to}/README.md`], async () => {
    await moveDir(p.dir, to);
    return { slug, from: `${p.dir}/`, to: `${to}/` };
  });
}

/** Urungkan hapus: folder di Archive/Deleted/Projects/ balik ke tempat asalnya (Projects/ atau Archive/Projects/). */
export async function undeleteProject(slug: string, input: { from: string; to: string }) {
  const from = input.from.replace(/\/+$/, ""), to = input.to.replace(/\/+$/, "");
  if (!/^Archive\/Deleted\/Projects\/[^/\\]+$/.test(from)) throw new WriteError(400, "Path proyek terhapus tidak valid");
  if (!/^[^/\\.][^/\\]*$/.test(slug) || (to !== `Projects/${slug}` && to !== `Archive/Projects/${slug}`)) throw new WriteError(400, "Tujuan pulihkan tidak valid");
  return withLocks([`${from}/README.md`, `${to}/README.md`], async () => {
    if (!(await exists(safeResolve(from)!.abs))) throw new WriteError(404, "Folder proyek terhapus tidak ketemu");
    await moveDir(from, to);
    return { slug, from: `${from}/`, to: `${to}/` };
  });
}

export async function setGoalStatus(slug: string, status: string) {
  if (!["active", "done", "dropped"].includes(status)) throw new WriteError(400, `Status tidak valid: ${status}`);
  const g = (await getVault()).goals.find((x) => x.slug === slug);
  if (!g) throw new WriteError(404, "Goal tidak ketemu");
  return withLocks([g.file], async () => {
    const d = await readDoc(g.file);
    if (!d.exists) throw new WriteError(404, "File goal tidak ketemu");
    setFmField(d, "status", status);
    await writeDoc(d);
    return { file: g.file, status };
  });
}

const HORIZONS = ["vision", "medium", "year", "quarter"];

export async function createGoal(input: { title: string; horizon: string; target?: string | null; desc?: string }) {
  const title = input.title.replace(/[\r\n]+/g, " ").trim();
  if (!title) throw new WriteError(400, "Judul goal kosong");
  if (title.length > 200) throw new WriteError(400, "Judul kepanjangan");
  if (!HORIZONS.includes(input.horizon)) throw new WriteError(400, `Horizon tidak valid: ${input.horizon}`);
  if (input.target && !isIsoDate(input.target)) throw new WriteError(400, "Target harus YYYY-MM-DD");
  const base = slugify(title) || "goal";
  let slug = base;
  for (let n = 2; await exists(safeResolve(`Goals/${slug}.md`)!.abs); n++) slug = `${base}-${n}`;
  const rel = `Goals/${slug}.md`;
  return withLocks([rel], async () => {
    const d = await readDoc(rel);
    if (d.exists) throw new WriteError(409, "Goal udah ada");
    const desc = (input.desc ?? "").replace(/\r\n/g, "\n").trim();
    d.lines = [
      "---",
      `title: ${yamlScalar(title)}`,
      `horizon: ${input.horizon}`,
      "status: active",
      ...(input.target ? [`target: ${input.target}`] : []),
      "---",
      ...(desc ? desc.split("\n") : []),
      "",
    ];
    await writeDoc(d);
    return { slug, file: rel };
  });
}

export type GoalPatch = { title?: string; horizon?: string; target?: string | null; desc?: string };

/** Edit goal: judul, horizon, target, deskripsi. Slug / nama file tetap, biar `goal:` di proyek ga putus. */
export async function updateGoal(slug: string, patch: GoalPatch) {
  const g = (await getVault()).goals.find((x) => x.slug === slug);
  if (!g) throw new WriteError(404, "Goal tidak ketemu");
  const title = patch.title?.replace(/[\r\n]+/g, " ").trim();
  if (patch.title !== undefined && !title) throw new WriteError(400, "Judul goal kosong");
  if (title && title.length > 200) throw new WriteError(400, "Judul kepanjangan");
  if (patch.horizon !== undefined && !HORIZONS.includes(patch.horizon)) throw new WriteError(400, `Horizon tidak valid: ${patch.horizon}`);
  if (patch.target && !isIsoDate(patch.target)) throw new WriteError(400, "Target harus YYYY-MM-DD");
  return withLocks([g.file], async () => {
    const d = await readDoc(g.file);
    if (!d.exists) throw new WriteError(404, "File goal tidak ketemu");
    const changed: string[] = [];
    if (title && title !== g.title) {
      setFmField(d, "title", yamlScalar(title));
      changed.push("title");
    }
    if (patch.horizon !== undefined && patch.horizon !== g.horizon) {
      setFmField(d, "horizon", patch.horizon);
      changed.push("horizon");
    }
    if (patch.target !== undefined && (patch.target || null) !== g.target) {
      if (patch.target) setFmField(d, "target", patch.target);
      else removeFmField(d, "target");
      changed.push("target");
    }
    if (patch.desc !== undefined) {
      const desc = patch.desc.replace(/\r\n/g, "\n").trim();
      // area deskripsi: sesudah frontmatter sampai milestone pertama / "## Quest" (sama kayak parser)
      const start = fmEnd(d.lines) + 1;
      let end = d.lines.findIndex((l, i) => i >= start && GOAL_DESC_END.test(l));
      const hasRest = end >= 0;
      if (!hasRest) end = d.lines.length;
      if (d.lines.slice(start, end).join("\n").trim() !== desc) {
        const body = desc ? desc.split("\n") : [];
        d.lines.splice(start, end - start, ...body, ...(body.length || !hasRest ? [""] : []));
        changed.push("desc");
      }
    }
    if (changed.length) await writeDoc(d);
    return { slug, file: g.file, changed };
  });
}

/** Pindah satu file. Rename dicoba ulang kalau lagi dipegang app lain. */
async function moveFile(fromRel: string, toRel: string) {
  const from = safeResolve(fromRel), to = safeResolve(toRel);
  if (!from || !to) throw new WriteError(400, "Path tidak valid");
  if (await exists(to.abs)) throw new WriteError(409, `File tujuan udah ada: ${toRel}`);
  await fs.mkdir(path.dirname(to.abs), { recursive: true });
  await withWatcherPaused([fromRel, toRel], async () => {
    for (let i = 0; ; i++) {
      try {
        await fs.rename(from.abs, to.abs);
        return;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (i < 6 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) {
          await new Promise((r) => setTimeout(r, 100 * (i + 1)));
          continue;
        }
        throw new WriteError(409, `File ga bisa dipindah (${code ?? "error"}). Mungkin lagi dibuka di Obsidian.`);
      }
    }
  });
}

/** Hapus goal: file dipindah ke Archive/Goals/ (bisa diurungkan), ga dihapus permanen. */
export async function deleteGoal(slug: string) {
  const g = (await getVault()).goals.find((x) => x.slug === slug);
  if (!g) throw new WriteError(404, "Goal tidak ketemu");
  let to = `Archive/Goals/${slug}.md`;
  for (let n = 2; await exists(safeResolve(to)!.abs); n++) to = `Archive/Goals/${slug}-${n}.md`;
  return withLocks([g.file, to], async () => {
    await moveFile(g.file, to);
    return { slug, from: g.file, to };
  });
}

/** Urungkan hapus: Archive/Goals/<x>.md balik ke Goals/<slug>.md. */
export async function restoreGoal(archived: string, slug: string) {
  if (!/^Archive\/Goals\/[^/]+\.md$/.test(archived)) throw new WriteError(400, "Path arsip goal tidak valid");
  if (!/^[^/\\.][^/\\]*$/.test(slug)) throw new WriteError(400, "Slug tidak valid");
  const to = `Goals/${slug}.md`;
  return withLocks([archived, to], async () => {
    if (!(await exists(resolveMd(archived).abs))) throw new WriteError(404, "File arsip goal tidak ketemu");
    await moveFile(archived, to);
    return { slug, from: archived, to };
  });
}

/* ===== konten (Fase 4) ===== */

/** Satu nilai YAML di dalam flow map / list: angka apa adanya, teks dikutip kalau perlu. */
const flowVal = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(v) : yamlScalar(String(v)) || '""');

export type ContentPatch = {
  stage?: string;
  platform?: string[];
  project?: string | null;
  published?: string | null;
  stats?: { views?: number | null; comments?: number | null; retention?: string | null };
};

/** Ubah frontmatter konten per field. Masuk review/done & `published` kosong → diisi hari ini. */
export async function updateContent(slug: string, patch: ContentPatch) {
  const v = await getVault();
  const c = v.content.find((x) => x.slug === slug);
  if (!c) throw new WriteError(404, "Konten tidak ketemu");
  if (patch.stage !== undefined && !STAGE_KEYS.includes(patch.stage)) throw new WriteError(400, `Stage tidak valid: ${patch.stage}`);
  if (patch.platform && patch.platform.some((p) => !/^[\w-]{1,30}$/.test(p))) throw new WriteError(400, "Platform tidak valid");
  if (patch.project && !v.projects.some((p) => p.slug === patch.project)) throw new WriteError(404, "Proyek tidak ketemu");
  if (patch.published && !isIsoDate(patch.published)) throw new WriteError(400, "published harus YYYY-MM-DD");

  return withLocks([c.file], async () => {
    const d = await readDoc(c.file);
    if (!d.exists) throw new WriteError(404, "File konten tidak ketemu");
    const fm = fmOf(d);
    const changed: string[] = [];

    if (patch.stage !== undefined && patch.stage !== String(fm.stage ?? "")) {
      setFmField(d, "stage", patch.stage);
      changed.push("stage");
      if (PUBLISHED_STAGES.includes(patch.stage) && !fm.published && patch.published === undefined) {
        setFmField(d, "published", todayIso());
        changed.push("published");
      }
    }
    if (patch.platform !== undefined) {
      const list = [...new Set(patch.platform)];
      if (list.length) setFmField(d, "platform", `[${list.join(", ")}]`);
      else removeFmField(d, "platform");
      changed.push("platform");
    }
    if (patch.project !== undefined) {
      if (patch.project) setFmField(d, "project", patch.project);
      else removeFmField(d, "project");
      changed.push("project");
    }
    if (patch.published !== undefined) {
      if (patch.published) setFmField(d, "published", patch.published);
      else removeFmField(d, "published");
      changed.push("published");
    }
    if (patch.stats) {
      // field stats lain (mis. likes) yang ditulis manual tetap dijaga
      const old = fm.stats && typeof fm.stats === "object" && !Array.isArray(fm.stats) ? (fm.stats as Record<string, unknown>) : {};
      const map: Record<string, unknown> = { ...old };
      for (const [k, val] of Object.entries(patch.stats)) {
        if (val === null || val === undefined || val === "") delete map[k];
        else map[k] = val;
      }
      const keys = Object.keys(map).filter((k) => /^[\w-]+$/.test(k) && map[k] !== null && typeof map[k] !== "object");
      if (keys.length) setFmField(d, "stats", `{ ${keys.map((k) => `${k}: ${flowVal(map[k])}`).join(", ")} }`);
      else removeFmField(d, "stats");
      changed.push("stats");
    }
    if (changed.length) await writeDoc(d);
    return { file: c.file, changed, published: String(fmOf(d).published ?? "") || null };
  });
}

/** Ide cepat: bikin `Content/<slug>.md` dengan `stage: idea`. */
/** Hapus konten: file dipindah ke Archive/Deleted/Content/ (bisa diurungkan), ga dihapus permanen. */
export async function deleteContent(slug: string) {
  const c = (await getVault()).content.find((x) => x.slug === slug);
  if (!c) throw new WriteError(404, "Konten tidak ketemu");
  let to = `Archive/Deleted/Content/${slug}.md`;
  for (let n = 2; await exists(safeResolve(to)!.abs); n++) to = `Archive/Deleted/Content/${slug}-${n}.md`;
  return withLocks([c.file, to], async () => {
    await moveDir(c.file, to); // rename biasa, jalan juga buat file
    return { slug, from: c.file, to };
  });
}

/** Urungkan hapus: Archive/Deleted/Content/<x>.md balik ke Content/<slug>.md. */
export async function undeleteContent(slug: string, from: string) {
  if (!/^Archive\/Deleted\/Content\/[^/\\]+\.md$/.test(from)) throw new WriteError(400, "Path konten terhapus tidak valid");
  if (!/^[^/\\.][^/\\]*$/.test(slug)) throw new WriteError(400, "Slug tidak valid");
  const to = `Content/${slug}.md`;
  return withLocks([from, to], async () => {
    if (!(await exists(resolveMd(from).abs))) throw new WriteError(404, "File konten terhapus tidak ketemu");
    await moveDir(from, to);
    return { slug, from, to };
  });
}

/**
 * Hapus judul watchlist: file dipindah ke Archive/Deleted/Watchlist/ (bisa diurungkan), ga dihapus permanen.
 * Gambar cover di Watchlist/_covers/ dibiarin, biar Urungkan balikin judul lengkap dengan cover-nya.
 */
export async function deleteWatch(slug: string) {
  const w = (await getVault()).watch.find((x) => x.slug === slug);
  if (!w) throw new WriteError(404, "Judul tidak ketemu");
  let to = `Archive/Deleted/Watchlist/${slug}.md`;
  for (let n = 2; await exists(safeResolve(to)!.abs); n++) to = `Archive/Deleted/Watchlist/${slug}-${n}.md`;
  return withLocks([w.file, to], async () => {
    await moveDir(w.file, to); // rename biasa, jalan juga buat file
    return { slug, from: w.file, to };
  });
}

/** Urungkan hapus: Archive/Deleted/Watchlist/<x>.md balik ke Watchlist/<slug>.md. */
export async function undeleteWatch(slug: string, from: string) {
  if (!/^Archive\/Deleted\/Watchlist\/[^/\\]+\.md$/.test(from)) throw new WriteError(400, "Path judul terhapus tidak valid");
  if (!/^[^/\\.][^/\\]*$/.test(slug)) throw new WriteError(400, "Slug tidak valid");
  const to = `Watchlist/${slug}.md`;
  return withLocks([from, to], async () => {
    if (!(await exists(resolveMd(from).abs))) throw new WriteError(404, "File judul terhapus tidak ketemu");
    await moveDir(from, to);
    return { slug, from, to };
  });
}

export async function createIdea(input: { title: string; project?: string | null; note?: string }) {
  const title = input.title.replace(/[\r\n]+/g, " ").trim();
  if (!title) throw new WriteError(400, "Judul ide kosong");
  if (title.length > 200) throw new WriteError(400, "Judul kepanjangan");
  const v = await getVault();
  if (input.project && !v.projects.some((p) => p.slug === input.project && !p.isArchived)) throw new WriteError(404, "Proyek tidak ketemu");
  const base = slugify(title) || "ide";
  let slug = base;
  for (let n = 2; await exists(safeResolve(`Content/${slug}.md`)!.abs); n++) slug = `${base}-${n}`;
  const rel = `Content/${slug}.md`;
  return withLocks([rel], async () => {
    const d = await readDoc(rel);
    if (d.exists) throw new WriteError(409, "Konten udah ada");
    const note = (input.note ?? "").replace(/\r\n/g, "\n").trim();
    d.lines = [
      "---",
      `title: ${yamlScalar(title)}`,
      "stage: idea",
      ...(input.project ? [`project: ${input.project}`] : []),
      "---",
      ...(note ? note.split("\n") : []),
      "",
    ];
    await writeDoc(d);
    return { slug, file: rel };
  });
}

/* ===== editor catatan (Fase 5) ===== */

const NOTE_MAX = 2 * 1024 * 1024;

/** Isi mentah + mtime langsung dari disk (bukan dari index) buat dibuka di editor. */
export async function readNote(rel: string) {
  const safe = resolveMd(rel);
  try {
    const [raw, st] = await Promise.all([fs.readFile(safe.abs, "utf8"), fs.stat(safe.abs)]);
    return { path: safe.rel, raw, mtime: st.mtimeMs };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new WriteError(404, "Catatan tidak ketemu");
    throw e;
  }
}

/**
 * Simpan seluruh isi catatan. `baseMtime` = mtime waktu editor dibuka; kalau file udah berubah
 * dari luar (Claude / Obsidian) → 409 + isi terbaru, biar user yang mutusin (REQUIREMENTS §8).
 */
export async function saveNote(rel: string, input: { content: string; baseMtime: number; force?: boolean }) {
  if (input.content.length > NOTE_MAX) throw new WriteError(413, "Catatan kegedean (maks 2 MB)");
  const safeRel = resolveMd(rel).rel;
  return withLocks([safeRel], async () => {
    const d = await readDoc(safeRel);
    if (!d.exists) throw new WriteError(404, "Catatan tidak ketemu (mungkin dipindah / dihapus)");
    const st = await fs.stat(d.abs);
    if (!input.force && Math.abs(st.mtimeMs - input.baseMtime) > 1) {
      throw new WriteError(409, "Catatan ini berubah dari luar sejak dibuka", { raw: docText(d), mtime: st.mtimeMs });
    }
    // gaya baris file dipertahankan (CRLF / LF)
    d.lines = input.content.replace(/\r\n/g, "\n").split("\n");
    await writeDoc(d);
    return { path: safeRel, mtime: (await fs.stat(d.abs)).mtimeMs };
  });
}

/* ===== watchlist (Fase 6) ===== */

export type WatchPatch = {
  epDelta?: number; // +1 ep dari kartu (atau -1 buat batal)
  progress?: number;
  total?: number | null;
  status?: string;
  rating?: number | null;
  type?: string;
  coverPos?: CoverPos | null;
};

async function findWatch(slug: string) {
  const w = (await getVault()).watch.find((x) => x.slug === slug);
  if (!w) throw new WriteError(404, "Judul tidak ketemu");
  return w;
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 1_000_000;

/** Ubah frontmatter judul watchlist per field; `updated` ikut diisi hari ini kalau ada yang berubah. */
export async function updateWatch(slug: string, patch: WatchPatch) {
  if (patch.epDelta !== undefined && patch.epDelta !== 1 && patch.epDelta !== -1) throw new WriteError(400, "epDelta cuma boleh 1 / -1");
  if (patch.progress !== undefined && !isCount(patch.progress)) throw new WriteError(400, "progress harus angka bulat ≥ 0");
  if (patch.total !== undefined && patch.total !== null && (!isCount(patch.total) || patch.total < 1)) throw new WriteError(400, "total harus angka bulat ≥ 1");
  if (patch.status !== undefined && !(WATCH_STATUS as readonly string[]).includes(patch.status)) throw new WriteError(400, `Status tidak valid: ${patch.status}`);
  if (patch.type !== undefined && !(WATCH_TYPES as readonly string[]).includes(patch.type)) throw new WriteError(400, `Tipe tidak valid: ${patch.type}`);
  if (patch.rating !== undefined && patch.rating !== null && !(Number.isInteger(patch.rating) && patch.rating >= 1 && patch.rating <= 10))
    throw new WriteError(400, "Rating harus 1–10");
  const w = await findWatch(slug);

  return withLocks([w.file], async () => {
    const d = await readDoc(w.file);
    if (!d.exists) throw new WriteError(404, "File watchlist tidak ketemu");
    const fm = fmOf(d);
    const changed: string[] = [];
    const cur = { progress: num(fm.progress) ?? 0, status: String(fm.status ?? "plan") };

    let progress = patch.progress ?? cur.progress;
    if (patch.epDelta) progress = Math.max(0, progress + patch.epDelta);
    if (progress !== cur.progress) {
      setFmField(d, "progress", String(progress));
      changed.push("progress");
    }
    // nambah episode dari judul yang masih rencana = mulai nonton
    const status = patch.status ?? (patch.epDelta === 1 && cur.status === "plan" ? "watching" : undefined);
    if (status !== undefined && status !== cur.status) {
      setFmField(d, "status", status);
      changed.push("status");
    }
    if (patch.total !== undefined && patch.total !== (num(fm.total) ?? null)) {
      if (patch.total) setFmField(d, "total", String(patch.total));
      else removeFmField(d, "total");
      changed.push("total");
    }
    if (patch.rating !== undefined && patch.rating !== (num(fm.rating) ?? null)) {
      setFmField(d, "rating", patch.rating ? String(patch.rating) : "");
      changed.push("rating");
    }
    if (patch.type !== undefined && patch.type !== String(fm.type ?? "")) {
      setFmField(d, "type", patch.type);
      changed.push("type");
    }
    if (patch.coverPos !== undefined) {
      if (patch.coverPos) setFmField(d, "cover_pos", coverPosValue(clampCoverPos(patch.coverPos)));
      else removeFmField(d, "cover_pos");
      changed.push("cover_pos");
    }
    if (changed.length) {
      setFmField(d, "updated", todayIso());
      await writeDoc(d);
    }
    const after = fmOf(d);
    return { file: w.file, changed, progress: num(after.progress) ?? 0, status: String(after.status ?? "plan") };
  });
}

/** Tambah judul: bikin `Watchlist/<slug>.md`. */
export async function createWatch(input: { title: string; type: string; status?: string; total?: number | null }) {
  const title = input.title.replace(/[\r\n]+/g, " ").trim();
  if (!title) throw new WriteError(400, "Judul kosong");
  if (title.length > 200) throw new WriteError(400, "Judul kepanjangan");
  if (!(WATCH_TYPES as readonly string[]).includes(input.type)) throw new WriteError(400, `Tipe tidak valid: ${input.type}`);
  const status = input.status ?? "plan";
  if (!(WATCH_STATUS as readonly string[]).includes(status)) throw new WriteError(400, `Status tidak valid: ${status}`);
  if (input.total != null && (!isCount(input.total) || input.total < 1)) throw new WriteError(400, "total harus angka bulat ≥ 1");
  const base = slugify(title) || "judul";
  let slug = base;
  for (let n = 2; await exists(safeResolve(`Watchlist/${slug}.md`)!.abs); n++) slug = `${base}-${n}`;
  const rel = `Watchlist/${slug}.md`;
  return withLocks([rel], async () => {
    const d = await readDoc(rel);
    if (d.exists) throw new WriteError(409, "Judul udah ada");
    d.lines = [
      "---",
      `title: ${yamlScalar(title)}`,
      `type: ${input.type}`,
      `status: ${status}`,
      "progress: 0",
      ...(input.total ? [`total: ${input.total}`] : []),
      "rating:",
      `updated: ${todayIso()}`,
      "---",
      "",
    ];
    await writeDoc(d);
    return { slug, file: rel };
  });
}

/** Path cover hasil upload. Nama file dari slug, dibersihin biar aman di semua OS. */
const coverRelOf = (slug: string) => `${COVER_DIR}/${slug.replace(/[^\w.-]+/g, "-").replace(/^\.+/, "") || "cover"}.webp`;

/**
 * Upload cover: re-encode ke webp (lebar maks 800px), simpan ke `Watchlist/_covers/<slug>.webp`,
 * isi `cover`, posisi lama di-reset (gambar baru = framing baru).
 */
export async function setWatchCover(slug: string, data: Uint8Array) {
  if (!data.length) throw new WriteError(400, "File kosong");
  if (data.length > COVER_MAX_BYTES) throw new WriteError(413, "Gambar maks 5 MB");
  const w = await findWatch(slug);
  let webp: Buffer;
  try {
    webp = await sharp(data, { limitInputPixels: 60_000_000 })
      .rotate() // ikut orientasi EXIF foto HP
      .resize({ width: COVER_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new WriteError(400, "File bukan gambar yang bisa dibaca");
  }
  const coverRel = coverRelOf(w.slug);
  const safe = safeResolve(coverRel);
  if (!safe) throw new WriteError(400, "Path cover tidak valid");
  return withLocks([w.file, coverRel], async () => {
    const d = await readDoc(w.file);
    if (!d.exists) throw new WriteError(404, "File watchlist tidak ketemu");
    await writeAtomic(safe.abs, webp);
    setFmField(d, "cover", coverRel.slice("Watchlist/".length));
    removeFmField(d, "cover_pos");
    setFmField(d, "updated", todayIso());
    await writeDoc(d);
    return { file: w.file, cover: coverRel, bytes: webp.length };
  });
}

/** Hapus cover: kosongkan `cover` & `cover_pos`. File gambar ikut dihapus kalau ada di `_covers/` (hasil upload app). */
export async function removeWatchCover(slug: string) {
  const w = await findWatch(slug);
  const owned = w.cover && w.cover.startsWith(COVER_DIR + "/") ? safeResolve(w.cover) : null;
  return withLocks([w.file, ...(owned ? [owned.rel] : [])], async () => {
    const d = await readDoc(w.file);
    if (!d.exists) throw new WriteError(404, "File watchlist tidak ketemu");
    removeFmField(d, "cover");
    removeFmField(d, "cover_pos");
    setFmField(d, "updated", todayIso());
    await writeDoc(d);
    let removedFile: string | null = null;
    if (owned) {
      await fs.rm(owned.abs, { force: true });
      removedFile = owned.rel;
      markDirty();
    }
    return { file: w.file, removedFile };
  });
}
