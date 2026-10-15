/** Konvensi konten (REQUIREMENTS §5.6). Dipakai bareng server & client. */

export const STAGES = [
  ["idea", "Ide"],
  ["script", "Script"],
  ["storyboard", "Storyboard"],
  ["shotlist", "Shot list"],
  ["rekaman", "Rekaman"],
  ["edit", "Edit"],
  ["upload", "Upload"],
  ["review", "Review 48 jam"],
  ["done", "Done"],
] as const;

export type Stage = (typeof STAGES)[number][0];
export const STAGE_KEYS: readonly string[] = STAGES.map((s) => s[0]);
export const stageLabel = (k: string) => STAGES.find((s) => s[0] === k)?.[1] ?? k;

/** Masuk tahap ini = udah diupload → `published` diisi hari ini kalau masih kosong. */
export const PUBLISHED_STAGES: readonly string[] = ["review", "done"];

export const PLATFORMS = ["tiktok", "ig", "yt", "fb", "x"] as const;

/** Isi `stats` yang dikelola app (dicatat waktu review 48 jam). */
export type ContentStats = { views: number | null; comments: number | null; retention: string | null };
