/** Konvensi Watchlist (REQUIREMENTS §5.7). Dipakai server & client. */

export const WATCH_STATUS = ["plan", "watching", "done", "dropped"] as const;
export const WATCH_TYPES = ["anime", "series", "movie", "book"] as const;

export const WATCH_STATUS_LABEL = { watching: "ditonton", plan: "rencana", done: "selesai", dropped: "drop" } as const;

export const COVER_MAX_BYTES = 5 * 1024 * 1024;
export const COVER_MAX_WIDTH = 800;
export const COVER_DIR = "Watchlist/_covers";

export type CoverPos = { x: number; y: number; z: number };
export const DEFAULT_COVER_POS: CoverPos = { x: 50, y: 50, z: 1 };

export function clampCoverPos(c: CoverPos): CoverPos {
  const cl = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
  return { x: cl(c.x, 0, 100), y: cl(c.y, 0, 100), z: cl(c.z, 1, 3) };
}

/** Nilai frontmatter `cover_pos`: "x y zoom". */
export const coverPosValue = (c: CoverPos) => `${Math.round(c.x * 10) / 10} ${Math.round(c.y * 10) / 10} ${c.z.toFixed(2)}`;
