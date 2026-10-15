import "server-only";
import { getVault } from "./index";
import { addDays, dayDiff, fromIso, iso, savedLabel, todayIso } from "./dates";
import { journalPath } from "./journal-format";
import type { HabitState, JournalEntry, Project, Quest, VaultIndex } from "./types";

/* ===== aturan bersama ===== */

/**
 * Quest aktif (Hari ini): Uncategorize, README proyek yang tidak diarsip, dan milestone goal.
 * Checkbox di catatan lain proyek (diskusi, roadmap) cuma tampil di drawer proyek. REQUIREMENTS §6.1
 */
export function liveQuests(v: VaultIndex): Quest[] {
  const readme = new Set(v.projects.filter((p) => !p.isArchived).map((p) => p.file));
  return v.quests.filter((q) => q.source === "uncat" || q.source === "goal" || (q.source === "project" && readme.has(q.file)));
}

/** Label proyek/goal buat baris di "## Quest selesai". */
export function questLabel(v: VaultIndex, q: Quest): string | null {
  if (q.project) return v.projects.find((p) => p.slug === q.project)?.title ?? q.project;
  if (q.goal) return v.goals.find((g) => g.slug === q.goal)?.title ?? q.goal;
  return null;
}

/** Uncategorize tanpa proyek: @work = work, sisanya personal. */
export function questKind(q: Quest, projects: Map<string, Project>): "personal" | "work" {
  const p = q.project ? projects.get(q.project) : null;
  return p ? p.type : q.tags.includes("work") ? "work" : "personal";
}

/** Urutan file: README proyek duluan, lalu path, lalu nomor baris. */
export function byFile(a: Quest, b: Quest) {
  if (a.file === b.file) return a.line - b.line;
  const ra = a.file.endsWith("/README.md") ? 0 : 1, rb = b.file.endsWith("/README.md") ? 0 : 1;
  return ra - rb || a.file.localeCompare(b.file);
}

export function projectStats(v: VaultIndex, slug: string) {
  const qs = v.quests.filter((q) => q.project === slug).sort(byFile);
  const done = qs.filter((q) => q.done).length;
  return { total: qs.length, done, open: qs.length - done, progress: qs.length ? done / qs.length : 0, next: qs.find((q) => !q.done) ?? null };
}

export type NavCounts = { today: number; projects: number; content: number; watch: number };

export async function getShell() {
  const v = await getVault();
  return {
    vaultName: v.vaultName,
    fileCount: v.files.length,
    counts: {
      today: liveQuests(v).filter((q) => !q.done).length,
      projects: v.projects.filter((p) => p.status === "active").length,
      content: v.content.filter((c) => c.stage !== "done").length,
      watch: v.watch.filter((w) => w.status === "watching").length,
    } satisfies NavCounts,
    palette: [
      ...v.projects.map((p) => ({ label: p.title, kind: p.isArchived ? "arsip" : "proyek", href: `/projects?p=${encodeURIComponent(p.slug)}` })),
      ...v.goals.map((g) => ({ label: g.title, kind: "goal", href: "/goals" })),
      ...v.watch.map((w) => ({ label: w.title, kind: "watchlist", href: "/watchlist" })),
      ...v.files.filter((f) => f.isMd).map((f) => ({ label: f.path, kind: "catatan", href: `/notes?path=${encodeURIComponent(f.path)}` })),
    ],
  };
}

/* ===== jurnal & habit ===== */

export function journalMap(v: VaultIndex) {
  return new Map(v.journal.map((j) => [j.date, j]));
}

/** Tanggal yang beneran dijurnal (jurnal kosong = belum nulis). */
const writtenDates = (v: VaultIndex, upTo: string) => v.journal.filter((j) => !j.isEmpty && j.date <= upTo).map((j) => j.date);

/** Streak habit: hari "done" berturut-turut sampai kemarin. Terlewat / kosong = putus. */
export function habitBase(byDate: Map<string, JournalEntry>, id: string, today: string) {
  let n = 0;
  for (let d = addDays(today, -1); byDate.get(d)?.habits[id] === "done"; d = addDays(d, -1)) n++;
  return n;
}

export function heatLevel(words: number) {
  return words === 0 ? 0 : words <= 40 ? 1 : words <= 120 ? 2 : words <= 300 ? 3 : 4;
}

function journalStats(v: VaultIndex, today: string) {
  const dates = writtenDates(v, today);
  const set = new Set(dates);
  // streak sekarang: berakhir hari ini, atau kemarin kalau hari ini belum nulis
  let cur = 0;
  for (let d = set.has(today) ? today : addDays(today, -1); set.has(d); d = addDays(d, -1)) cur++;
  // rekor streak
  let best = 0, bestEnd: string | null = null, run = 0;
  dates.forEach((d, i) => {
    run = i > 0 && dayDiff(dates[i - 1], d) === 1 ? run + 1 : 1;
    if (run > best) { best = run; bestEnd = d; }
  });
  // bolong terpanjang (hari tanpa jurnal di antara dua jurnal, atau sampai kemarin)
  let gap = 0, gapFrom: string | null = null, gapTo: string | null = null;
  const points = [...dates, ...(set.has(today) ? [] : [today])];
  for (let i = 1; i < points.length; i++) {
    const n = dayDiff(points[i - 1], points[i]) - 1;
    if (n > gap) { gap = n; gapFrom = addDays(points[i - 1], 1); gapTo = addDays(points[i], -1); }
  }
  const last = [...dates].reverse().find((d) => d < today) ?? null;
  return {
    current: cur,
    best,
    bestFrom: bestEnd ? addDays(bestEnd, -(best - 1)) : null,
    bestTo: bestEnd,
    gap, gapFrom, gapTo,
    lastBeforeToday: last,
    gapBeforeToday: last ? dayDiff(last, today) - 1 : null,
    hasToday: set.has(today),
  };
}

/* ===== Hari ini ===== */
export async function getToday() {
  const v = await getVault();
  const today = todayIso();
  const byDate = journalMap(v);
  const tj = byDate.get(today) ?? null;
  const projMap = new Map(v.projects.map((p) => [p.slug, p]));
  const live = liveQuests(v).map((q) => ({ ...q, kind: questKind(q, projMap) }));
  const stats = journalStats(v, today);

  return {
    today,
    weekday: fromIso(today).getDay(),
    journal: tj ? { highlight: tj.highlight, summary: tj.summary, words: tj.words, file: tj.file, questsDone: tj.questsDone, savedAt: savedLabel(tj.mtime, today) } : null,
    journalFile: journalPath(today),
    gap: stats.gapBeforeToday && stats.gapBeforeToday >= 2 ? { days: stats.gapBeforeToday, last: stats.lastBeforeToday!, hasToday: stats.hasToday } : null,
    habits: v.habits.map((h) => ({ ...h, state: (tj?.habits[h.id] ?? null) as HabitState | null, base: habitBase(byDate, h.id, today) })),
    open: live.filter((q) => !q.done).sort(byFile),
    doneToday: live.filter((q) => q.done && q.doneAt === today).sort(byFile),
    groups: [
      { key: "uncat", title: "Uncategorize", type: null as null | "personal" | "work" },
      ...v.goals.map((gl) => ({ key: "goal:" + gl.slug, title: "Goal: " + gl.title, type: null })),
      ...v.projects.filter((p) => !p.isArchived).map((p) => ({ key: p.slug, title: p.title, type: p.type })),
    ],
    projectOptions: v.projects.filter((p) => !p.isArchived && p.status !== "done").map((p) => ({ slug: p.slug, title: p.title })),
    activeProjects: v.projects
      .filter((p) => p.status === "active")
      .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""))
      .slice(0, 5)
      .map((p) => ({ slug: p.slug, title: p.title, type: p.type, progress: projectStats(v, p.slug).progress })),
    watching: v.watch.filter((w) => w.status === "watching").slice(0, 3),
  };
}

/* ===== Goals ===== */
export async function getGoals() {
  const v = await getVault();
  return v.goals.map((g) => {
    const linked = v.projects.filter((p) => p.goal === g.slug);
    const qs = v.quests.filter((q) => q.goal === g.slug || (q.project && linked.some((p) => p.slug === q.project)));
    const done = qs.filter((q) => q.done).length;
    const m = g.metric;
    const progress = m && m.current !== null && m.target ? Math.min(1, m.current / m.target) : qs.length ? done / qs.length : 0;
    return {
      ...g,
      progress,
      questDone: done,
      questTotal: qs.length,
      links: linked.map((p) => ({ slug: p.slug, title: p.title, type: p.type, isArchived: p.isArchived })),
    };
  });
}

/* ===== Proyek ===== */
export async function getProjects() {
  const v = await getVault();
  return v.projects.map((p) => {
    const s = projectStats(v, p.slug);
    return {
      ...p,
      stats: { total: s.total, done: s.done, open: s.open, progress: s.progress },
      next: s.next?.text ?? null,
      quests: v.quests.filter((q) => q.project === p.slug).sort(byFile),
    };
  });
}

/* ===== Konten ===== */
export async function getContent() {
  const v = await getVault();
  const pm = new Map(v.projects.map((p) => [p.slug, p]));
  return v.content.map((c) => {
    const p = c.project ? pm.get(c.project) : null;
    return { ...c, projectInfo: p ? { title: p.title, type: p.type, isArchived: p.isArchived } : c.project ? { title: c.project, type: null, isArchived: false } : null };
  });
}

/* ===== Jurnal & Habit ===== */
export async function getJournalPage() {
  const v = await getVault();
  const today = todayIso();
  const byDate = journalMap(v);
  const stats = journalStats(v, today);

  // heatmap 26 minggu, kolom = minggu (Senin di atas)
  const startD = fromIso(addDays(today, -7 * 26 + 1));
  while (startD.getDay() !== 1) startD.setDate(startD.getDate() - 1);
  const cells: { date: string; level: number }[] = [];
  for (let d = iso(startD); d <= today; d = addDays(d, 1)) {
    const j = byDate.get(d);
    cells.push({ date: d, level: j && !j.isEmpty ? Math.max(1, heatLevel(j.words)) : 0 });
  }
  const inWindow = cells.filter((c) => c.level > 0).length;

  const days14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const strip = v.habits.map((h) => ({ ...h, days: days14.map((d) => ({ date: d, state: (byDate.get(d)?.habits[h.id] ?? null) as HabitState | null })) }));
  const tj = byDate.get(today);

  // timeline: terbaru dulu, sisipin baris "N hari tanpa jurnal" kalau bolong ≥ 7 hari
  const desc = [...v.journal].filter((j) => j.date <= today && !j.isEmpty).reverse();
  type Row = { kind: "day"; entry: JournalEntry } | { kind: "gap"; days: number; from: string; to: string; questsDone: number };
  const rows: Row[] = [];
  const gapRow = (from: string, to: string): Row => ({
    kind: "gap", days: dayDiff(from, to) + 1, from, to,
    questsDone: v.quests.filter((q) => q.doneAt && q.doneAt >= from && q.doneAt <= to).length,
  });
  // hari ini belum nulis & udah lama bolong: tampilin bolongnya paling atas
  if (desc[0] && desc[0].date < today && dayDiff(desc[0].date, today) - 1 >= 7) rows.push(gapRow(addDays(desc[0].date, 1), addDays(today, -1)));
  desc.forEach((j, i) => {
    rows.push({ kind: "day", entry: j });
    const older = desc[i + 1];
    if (older) {
      if (dayDiff(older.date, j.date) - 1 >= 7) rows.push(gapRow(addDays(older.date, 1), addDays(j.date, -1)));
    }
  });
  const tagCount = new Map<string, number>();
  v.journal.forEach((j) => j.tags.forEach((t) => tagCount.set(t, (tagCount.get(t) ?? 0) + 1)));

  return {
    today,
    cells,
    inWindow,
    stats,
    habitsToday: { done: v.habits.filter((h) => tj?.habits[h.id] === "done").length, missed: v.habits.filter((h) => tj?.habits[h.id] === "missed").length, total: v.habits.length },
    strip,
    rows,
    habitDefs: v.habits,
    // semua jurnal (termasuk yang kosong) buat editor "buka tanggal"
    entries: Object.fromEntries(
      v.journal.map((j) => [j.date, { highlight: j.highlight, summary: j.summary, habits: j.habits, questsDone: j.questsDone, file: j.file, savedAt: savedLabel(j.mtime, today) }]),
    ),
    tags: [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t),
  };
}

/* ===== Watchlist ===== */
export async function getWatch() {
  const v = await getVault();
  return v.watch;
}
