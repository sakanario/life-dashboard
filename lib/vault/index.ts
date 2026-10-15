import "server-only";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { connection } from "next/server";
import { watch, type FSWatcher } from "chokidar";
import { EXCLUDED_DIRS, isExcluded, toPosix, vaultRoot } from "./paths";
import { bodyTags, num, parseMd, parseQuests, plain, str, strList, wordCount } from "./parse";
import { isIsoDate } from "./dates";
import { splitJournalBody } from "./journal-format";
import type {
  ContentItem, Goal, GoalHorizon, HabitDef, HabitState, JournalEntry, MdDoc, Project, ProjectStatus, Quest,
  QuestSource, VaultFile, VaultIndex, WatchItem,
} from "./types";

/* ===== state di globalThis biar selamat dari HMR dev ===== */
type State = { index: VaultIndex | null; dirty: boolean; root: string | null; watcher: FSWatcher | null; bus: EventEmitter; timer: NodeJS.Timeout | null; changed: Set<string> };
const g = globalThis as unknown as { __vault?: State };
const S: State = (g.__vault ??= { index: null, dirty: true, root: null, watcher: null, bus: new EventEmitter(), timer: null, changed: new Set() });
S.bus.setMaxListeners(100);
// modul ini (atau parser-nya) baru dimuat ulang → index lama mungkin dibangun pakai kode lama
S.dirty = true;

export type VaultEvent = { type: "change"; paths: string[]; at: number };

/** Dengerin perubahan file vault (dipakai SSE). */
export function onVaultChange(fn: (e: VaultEvent) => void): () => void {
  ensureWatcher();
  S.bus.on("change", fn);
  return () => S.bus.off("change", fn);
}

function ensureWatcher() {
  const root = vaultRoot();
  if (S.watcher && S.root === root) return;
  // VAULT_PATH berubah (mis. .env diedit) → watcher lama dibuang, index dibangun ulang
  if (S.watcher) void S.watcher.close();
  S.root = root;
  S.dirty = true;
  S.watcher = watch(root, {
    ignoreInitial: true,
    ignored: (p: string) => {
      const rel = toPosix(path.relative(root, p));
      return !!rel && rel.split("/").some((part) => EXCLUDED_DIRS.has(part));
    },
    awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 },
  });
  S.watcher.on("all", (_ev, p) => {
    S.dirty = true;
    S.changed.add(toPosix(path.relative(root, p)));
    if (S.timer) clearTimeout(S.timer);
    S.timer = setTimeout(() => {
      const paths = [...S.changed];
      S.changed.clear();
      S.bus.emit("change", { type: "change", paths, at: Date.now() } satisfies VaultEvent);
    }, 150);
  });
}

/**
 * Jalanin `fn` dengan watcher dimatiin dulu. Di Windows folder yang lagi di-watch sering
 * ga bisa di-rename (EPERM), jadi pindah folder (arsip proyek) lewat sini.
 */
export async function withWatcherPaused<T>(paths: string[], fn: () => Promise<T>): Promise<T> {
  if (S.watcher) {
    const w = S.watcher;
    S.watcher = null;
    await w.close();
  }
  try {
    return await fn();
  } finally {
    S.dirty = true;
    ensureWatcher();
    S.bus.emit("change", { type: "change", paths, at: Date.now() } satisfies VaultEvent);
  }
}

/** Tandai index basi (dipanggil writer habis nulis, biar request berikutnya baca ulang). */
export function markDirty() {
  S.dirty = true;
}

/**
 * Index vault terbaru. Selalu jalan saat request (bukan saat build),
 * jadi data vault tidak pernah ikut ke-prerender.
 */
export async function getVault(): Promise<VaultIndex> {
  await connection();
  ensureWatcher();
  if (!S.index || S.dirty) {
    S.dirty = false;
    S.index = build();
  }
  return S.index;
}

/** `stats: { views, comments, retention }` di frontmatter konten; field lain dibiarin. */
function statsOf(v: unknown): ContentItem["stats"] {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  return { views: num(o.views), comments: num(o.comments), retention: str(o.retention) };
}

/* ===== build ===== */
function walk(root: string): VaultFile[] {
  const out: VaultFile[] = [];
  const rec = (dir: string) => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (EXCLUDED_DIRS.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) rec(abs);
      else if (e.isFile()) {
        const st = fs.statSync(abs);
        const rel = toPosix(path.relative(root, abs));
        out.push({ path: rel, isMd: rel.toLowerCase().endsWith(".md"), size: st.size, mtime: st.mtimeMs });
      }
    }
  };
  rec(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const HORIZONS: GoalHorizon[] = ["vision", "medium", "year", "quarter"];
const PROJECT_STATUS: ProjectStatus[] = ["idea", "active", "paused", "done", "archived"];
const WATCH_STATUS = ["plan", "watching", "done", "dropped"] as const;

function build(): VaultIndex {
  const root = vaultRoot();
  const files = walk(root).filter((f) => !isExcluded(f.path));
  const docs = new Map<string, MdDoc>();
  const byBasename = new Map<string, string[]>();

  for (const f of files) {
    const base = f.path.split("/").pop()!.toLowerCase();
    for (const key of new Set([base, base.replace(/\.md$/, "")])) {
      const arr = byBasename.get(key) ?? [];
      arr.push(f.path);
      byBasename.set(key, arr);
    }
    if (!f.isMd) continue;
    const raw = fs.readFileSync(path.join(root, f.path), "utf8");
    const { fm, body } = parseMd(raw);
    docs.set(f.path, { path: f.path, fm, body, raw, mtime: f.mtime });
  }

  /* --- proyek: Projects/<slug>/README.md + Archive/Projects/<slug>/README.md --- */
  const projects: Project[] = [];
  for (const d of docs.values()) {
    const m = /^(Projects|Archive\/Projects)\/([^/]+)\/README\.md$/i.exec(d.path);
    if (!m) continue;
    const dir = `${m[1]}/${m[2]}`;
    const inArchive = m[1].toLowerCase().startsWith("archive");
    const st = str(d.fm.status) as ProjectStatus | null;
    const status: ProjectStatus = inArchive ? "archived" : st && PROJECT_STATUS.includes(st) ? st : "active";
    projects.push({
      slug: m[2],
      title: str(d.fm.title) ?? m[2],
      type: str(d.fm.type) === "work" ? "work" : "personal",
      status,
      goal: str(d.fm.goal),
      tags: strList(d.fm.tags),
      updated: isIsoDate(str(d.fm.updated)) ? str(d.fm.updated) : null,
      archived: str(d.fm.archived),
      isArchived: status === "archived",
      desc: plain(d.body.split(/^##\s+Quest\b/im)[0]),
      dir,
      file: d.path,
      files: files.filter((f) => f.path.startsWith(dir + "/")).map((f) => f.path.slice(dir.length + 1))
        .sort((a, b) => (a === "README.md" ? -1 : b === "README.md" ? 1 : a.localeCompare(b))),
    });
  }
  projects.sort((a, b) => a.title.localeCompare(b.title));
  const projectByDir = new Map(projects.map((p) => [p.dir + "/", p]));

  /* --- goals --- */
  const goals: Goal[] = [];
  for (const d of docs.values()) {
    const m = /^Goals\/([^/]+)\.md$/i.exec(d.path);
    if (!m) continue;
    const h = str(d.fm.horizon) as GoalHorizon | null;
    const mt = d.fm.metric as Record<string, unknown> | undefined;
    goals.push({
      slug: m[1],
      title: str(d.fm.title) ?? m[1],
      horizon: h && HORIZONS.includes(h) ? h : "medium",
      status: (["active", "done", "dropped"].includes(String(d.fm.status)) ? d.fm.status : "active") as Goal["status"],
      target: str(d.fm.target),
      metric: mt && typeof mt === "object" ? { label: str(mt.label) ?? "", current: num(mt.current), target: num(mt.target) } : null,
      // deskripsi = teks sebelum milestone pertama atau heading "## Quest" (yang ditambah app)
      desc: plain(d.body.split(/^\s*[-*+] \[[ xX]\]|^##\s+Quest\b/im)[0]),
      file: d.path,
    });
  }

  /* --- konten --- */
  const content: ContentItem[] = [];
  for (const d of docs.values()) {
    const m = /^Content\/([^/]+)\.md$/i.exec(d.path);
    if (!m || d.fm.stage === undefined) continue; // tanpa stage = panduan (Pipeline Short Video)
    content.push({
      slug: m[1],
      title: str(d.fm.title) ?? m[1],
      stage: str(d.fm.stage) ?? "idea",
      platform: strList(d.fm.platform),
      project: str(d.fm.project),
      published: str(d.fm.published),
      stats: statsOf(d.fm.stats),
      snip: plain(d.body).slice(0, 180),
      file: d.path,
    });
  }
  content.sort((a, b) => a.title.localeCompare(b.title));

  /* --- jurnal --- */
  const journal: JournalEntry[] = [];
  for (const d of docs.values()) {
    const m = /^Journal\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})\.md$/.exec(d.path);
    if (!m) continue;
    const date = isIsoDate(str(d.fm.date)) ? str(d.fm.date)! : m[1];
    const hb: Record<string, HabitState> = {};
    if (d.fm.habits && typeof d.fm.habits === "object" && !Array.isArray(d.fm.habits)) {
      for (const [k, v] of Object.entries(d.fm.habits as Record<string, unknown>)) {
        if (v === "done" || v === "missed") hb[k] = v;
      }
    }
    const { summary, questsDone } = splitJournalBody(d.body);
    const highlight = str(d.fm.highlight) ?? "";
    journal.push({
      date, file: d.path, highlight, habits: hb, summary, questsDone,
      words: wordCount(plain(summary)), tags: bodyTags(summary),
      isEmpty: !summary && !highlight && !Object.keys(hb).length && !questsDone.length,
      mtime: d.mtime,
    });
  }
  journal.sort((a, b) => a.date.localeCompare(b.date));

  /* --- habit --- */
  const habitsDoc = docs.get("Habits.md");
  const habits: HabitDef[] = Array.isArray(habitsDoc?.fm.habits)
    ? (habitsDoc!.fm.habits as Record<string, unknown>[])
        .map((h) => ({ id: str(h?.id) ?? "", label: str(h?.label) ?? str(h?.id) ?? "" }))
        .filter((h) => h.id)
    : [];

  /* --- watchlist --- */
  const watchList: WatchItem[] = [];
  for (const d of docs.values()) {
    const m = /^Watchlist\/([^/]+)\.md$/i.exec(d.path);
    if (!m) continue;
    const pos = str(d.fm.cover_pos)?.split(/\s+/).map(Number);
    const st = str(d.fm.status);
    const cover = str(d.fm.cover);
    watchList.push({
      slug: m[1],
      title: str(d.fm.title) ?? m[1],
      type: str(d.fm.type) ?? "anime",
      status: (WATCH_STATUS as readonly string[]).includes(st ?? "") ? (st as WatchItem["status"]) : "plan",
      progress: num(d.fm.progress) ?? 0,
      total: num(d.fm.total),
      rating: num(d.fm.rating),
      cover: cover ? `Watchlist/${cover.replace(/^\.?\/+/, "")}` : null,
      coverPos: pos && pos.length >= 2 && pos.every(Number.isFinite) ? { x: pos[0], y: pos[1], z: pos[2] ?? 1 } : null,
      updated: str(d.fm.updated),
      file: d.path,
    });
  }
  watchList.sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? "") || a.title.localeCompare(b.title));

  /* --- quest dari semua .md --- */
  const goalSlugs = new Set(goals.map((x) => x.slug));
  const quests: Quest[] = [];
  for (const d of docs.values()) {
    let source: QuestSource = "other";
    let project: string | null = null;
    let goal: string | null = null;
    const proj = [...projectByDir.entries()].find(([dir]) => d.path.startsWith(dir))?.[1];
    if (proj) {
      source = "project";
      project = proj.slug;
    } else if (d.path === "Uncategorize.md") source = "uncat";
    else if (d.path.startsWith("Goals/")) {
      source = "goal";
      const s = d.path.slice(6, -3);
      goal = goalSlugs.has(s) ? s : null;
    } else if (d.path.startsWith("Content/")) source = "content";
    else if (d.path.startsWith("Journal/")) source = "journal";
    else if (d.path.startsWith("Archive/")) source = "archive";
    quests.push(...parseQuests(d.path, d.raw, { source, project, goal }));
  }

  return {
    builtAt: Date.now(),
    vaultName: path.basename(root),
    files,
    docs,
    byBasename,
    projects,
    goals,
    content,
    journal,
    habits,
    watch: watchList,
    quests,
  };
}
