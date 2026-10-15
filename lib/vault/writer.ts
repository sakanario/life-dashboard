import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { getVault, markDirty, withWatcherPaused } from "./index";
import { isIsoDate, todayIso } from "./dates";
import { doneLine, findDoneSection, journalPath, QUEST_DONE_TITLE } from "./journal-format";
import { PUBLISHED_STAGES, STAGE_KEYS } from "./content-format";
import { parseMd, parseQuests } from "./parse";
import { safeResolve } from "./paths";
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
