export type QuestSource = "uncat" | "project" | "goal" | "content" | "journal" | "archive" | "other";

export type Quest = {
  id: string; // "<file>:<line>"
  file: string;
  line: number; // 1-based
  text: string; // tanpa @tag dan done:
  raw: string; // baris asli, buat validasi tulis balik (Fase 2)
  done: boolean;
  doneAt: string | null;
  tags: string[];
  depth: number;
  source: QuestSource;
  project: string | null;
  goal: string | null;
};

export type ProjectType = "personal" | "work";
export type ProjectStatus = "idea" | "active" | "paused" | "done" | "archived";

export type Project = {
  slug: string;
  title: string;
  type: ProjectType;
  status: ProjectStatus;
  goal: string | null;
  tags: string[];
  updated: string | null;
  archived: string | null; // tanggal arsip
  isArchived: boolean;
  desc: string;
  dir: string; // Projects/<slug> atau Archive/Projects/<slug>
  file: string; // .../README.md
  files: string[]; // relatif ke dir
};

export type GoalHorizon = "vision" | "medium" | "year" | "quarter";

export type Goal = {
  slug: string;
  title: string;
  horizon: GoalHorizon;
  status: "active" | "done" | "dropped";
  target: string | null;
  metric: { label: string; current: number | null; target: number | null } | null;
  desc: string;
  file: string;
};

export type ContentItem = {
  slug: string;
  title: string;
  stage: string;
  platform: string[];
  project: string | null;
  published: string | null;
  snip: string;
  file: string;
};

export type HabitState = "done" | "missed";

export type JournalEntry = {
  date: string;
  file: string;
  highlight: string;
  habits: Record<string, HabitState>;
  summary: string;
  words: number;
  tags: string[];
};

export type HabitDef = { id: string; label: string };

export type WatchItem = {
  slug: string;
  title: string;
  type: string;
  status: "plan" | "watching" | "done" | "dropped";
  progress: number;
  total: number | null;
  rating: number | null;
  cover: string | null; // path relatif vault
  coverPos: { x: number; y: number; z: number } | null;
  updated: string | null;
  file: string;
};

export type VaultFile = { path: string; isMd: boolean; size: number; mtime: number };

export type MdDoc = { path: string; fm: Record<string, unknown>; body: string; raw: string; mtime: number };

export type VaultIndex = {
  builtAt: number;
  vaultName: string;
  files: VaultFile[];
  docs: Map<string, MdDoc>;
  byBasename: Map<string, string[]>; // nama file (lowercase, tanpa .md juga) → path
  projects: Project[];
  goals: Goal[];
  content: ContentItem[];
  journal: JournalEntry[]; // urut tanggal naik
  habits: HabitDef[];
  watch: WatchItem[];
  quests: Quest[];
};
