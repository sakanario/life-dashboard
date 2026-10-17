import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { totpSecret } from "./auth";
import { matchTotp } from "./totp";

/**
 * Penjaga login (REQUIREMENTS §9): anti replay kode TOTP, kode cadangan sekali pakai, batas salah.
 * State di `.auth/state.json` (dibikin scripts/setup-totp.mjs, di-gitignore). Isinya cuma hash, bukan kode.
 */

const STATE_FILE = path.join(process.cwd(), ".auth", "state.json");
type State = { secretId: string; lastStep: number; backup: string[] };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** Penanda secret yang dipakai state: ganti TOTP_SECRET = lastStep & kode cadangan lama ga berlaku. */
export const secretId = (secret: string) => sha256("ld-totp:" + secret).slice(0, 16);
export const normalizeBackup = (s: string) => s.replace(/[\s-]/g, "").toUpperCase();
export const hashBackup = (code: string) => sha256("ld-backup:" + normalizeBackup(code));

function loadState(): State {
  const id = secretId(totpSecret());
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as State;
    if (s.secretId === id) return { secretId: id, lastStep: Number(s.lastStep) || 0, backup: Array.isArray(s.backup) ? s.backup : [] };
  } catch {}
  return { secretId: id, lastStep: 0, backup: [] };
}

function saveState(s: State) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

export type CheckResult = { ok: true; backupLeft?: number } | { ok: false; reason: "wrong" | "replay" };

/**
 * Cek kode login: 6 digit = TOTP, 10 huruf/angka base32 = kode cadangan.
 * Bagian baca-cek-tulis state ga ada `await` di tengahnya, jadi dua request barengan ga bisa pakai kode yang sama.
 */
export async function checkLoginCode(input: string): Promise<CheckResult> {
  const code = input.replace(/[\s-]/g, "");
  if (/^\d{6}$/.test(code)) {
    const step = await matchTotp(totpSecret(), code);
    if (step === null) return { ok: false, reason: "wrong" };
    const s = loadState();
    if (step <= s.lastStep) return { ok: false, reason: "replay" };
    saveState({ ...s, lastStep: step });
    return { ok: true };
  }
  if (/^[A-Z2-7]{10}$/i.test(code)) {
    const s = loadState();
    const h = hashBackup(code);
    if (!s.backup.includes(h)) return { ok: false, reason: "wrong" };
    const backup = s.backup.filter((x) => x !== h);
    saveState({ ...s, backup });
    console.warn(`[login] kode cadangan dipakai, sisa ${backup.length}`);
    return { ok: true, backupLeft: backup.length };
  }
  return { ok: false, reason: "wrong" };
}

/* Batas salah: per IP (5 / 10 menit) + global longgar (50 / jam) biar penyerang ga bisa ngunci login pemilik
   dari satu IP, tapi tebakan dari banyak IP tetap kebatas. Disimpan di memori (reset kalau server restart). */
const IP_WINDOW = 10 * 60_000, IP_MAX = 5;
const GLOBAL_WINDOW = 60 * 60_000, GLOBAL_MAX = 50;
type Fails = { ip: Map<string, number[]>; all: number[] };
const g = globalThis as unknown as { __ldLoginFails?: Fails };
const fails = (): Fails => (g.__ldLoginFails ??= { ip: new Map(), all: [] });

function prune(now: number) {
  const f = fails();
  f.all = f.all.filter((t) => now - t < GLOBAL_WINDOW);
  for (const [ip, at] of f.ip) {
    const keep = at.filter((t) => now - t < IP_WINDOW);
    if (keep.length) f.ip.set(ip, keep);
    else f.ip.delete(ip);
  }
  return f;
}

/**
 * IP klien. Lewat Cloudflare Tunnel `CF-Connecting-IP` diisi Cloudflare (ga bisa dipalsuin klien);
 * server cuma bind 127.0.0.1, jadi header ini cuma bisa datang lewat tunnel/ngrok atau dari PC ini sendiri.
 */
export function clientIp(req: Request) {
  return req.headers.get("cf-connecting-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}

/** Detik tunggu kalau lagi dikunci, null kalau boleh coba. */
export function lockedFor(ip: string, now = Date.now()): number | null {
  const f = prune(now);
  const mine = f.ip.get(ip) ?? [];
  const waits: number[] = [];
  if (mine.length >= IP_MAX) waits.push(mine[0] + IP_WINDOW - now);
  if (f.all.length >= GLOBAL_MAX) waits.push(f.all[0] + GLOBAL_WINDOW - now);
  return waits.length ? Math.ceil(Math.max(...waits) / 1000) : null;
}

/** Catat salah; balikin sisa jatah IP ini. */
export function recordFail(ip: string, now = Date.now()) {
  const f = prune(now);
  const mine = [...(f.ip.get(ip) ?? []), now];
  f.ip.set(ip, mine);
  f.all.push(now);
  return Math.max(0, Math.min(IP_MAX - mine.length, GLOBAL_MAX - f.all.length));
}

/** Login sukses: hitungan IP ini dihapus (hitungan global tetap, biar ga bisa dipakai buat reset). */
export const clearFails = (ip: string) => void fails().ip.delete(ip);
