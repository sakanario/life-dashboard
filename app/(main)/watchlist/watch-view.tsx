"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { focusFirst } from "@/components/habits";
import { IC_MOVE, IC_UP } from "@/components/icons";
import { toast } from "@/components/toast";
import { Bar } from "@/components/ui";
import { useWatchEp } from "@/components/watch-ep";
import { api } from "@/lib/client-api";
import type { WatchItem } from "@/lib/vault/types";
import {
  clampCoverPos, COVER_MAX_BYTES, coverPosValue, DEFAULT_COVER_POS, WATCH_STATUS, WATCH_STATUS_LABEL, WATCH_TYPES, type CoverPos,
} from "@/lib/vault/watch-format";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const fmtDate = (s: string | null) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const [, m, d] = s.split("-").map(Number);
  return d + " " + BULAN[m - 1];
};
const STATUS_CLASS = { watching: "st-active", plan: "st-idea", done: "st-done", dropped: "st-paused" } as const;

/** Tanpa cover: gradient yang tetap per judul (dari hash slug). */
function gradient(slug: string) {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const a = h % 360, b = (a + 40 + ((h >> 8) % 60)) % 360;
  return `linear-gradient(135deg,hsl(${a} 55% 32%),hsl(${b} 70% 72%))`;
}

const posStyle = (c: CoverPos) =>
  ({ "--cx": `${c.x.toFixed(1)}%`, "--cy": `${c.y.toFixed(1)}%`, "--cz": c.z.toFixed(2) }) as React.CSSProperties;
const coverSrc = (w: WatchItem) => `/api/assets?path=${encodeURIComponent(w.cover!)}&v=${w.coverV}`;

export function WatchView({ items }: { items: WatchItem[] }) {
  const [f, setF] = useState<"all" | WatchItem["status"]>("all");
  const [type, setType] = useState("all");
  const [adding, setAdding] = useState(false);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const { progressOf, plusOne } = useWatchEp();
  const types = [...new Set([...WATCH_TYPES, ...items.map((w) => w.type)])];
  const list = items.filter((w) => (f === "all" || w.status === f) && (type === "all" || w.type === type));
  const opened = items.find((w) => w.slug === openSlug) ?? null;

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">Watchlist/</div>
          <h1>Watchlist</h1>
        </div>
        <div className="toolbar">
          <div className="seg" role="group" aria-label="Filter status">
            {(
              [
                ["all", "Semua"],
                ["watching", "Ditonton"],
                ["plan", "Rencana"],
                ["done", "Selesai"],
                ["dropped", "Drop"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>
                {l}
              </button>
            ))}
          </div>
          <select className="sel" aria-label="Filter tipe" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">semua tipe</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button className="btn" type="button" id="watch-add" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
            + Judul
          </button>
        </div>
      </div>
      {adding ? (
        <AddForm
          onClose={() => {
            setAdding(false);
            focusFirst(["watch-add"]);
          }}
        />
      ) : null}
      <div className="watch-grid">
        {list.map((w) => {
          const progress = progressOf(w);
          return (
            <article key={w.slug} className="panel watch">
              <Cover w={w} />
              <div className="watch-body">
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="chip">{w.type}</span>
                  <span className={"status " + STATUS_CLASS[w.status]}>{WATCH_STATUS_LABEL[w.status]}</span>
                  {w.rating !== null ? <span className="mono muted" style={{ whiteSpace: "nowrap" }} title={`Rating ${w.rating}/10`}>★ {w.rating}</span> : null}
                  <button
                    className="btn sm"
                    style={{ marginLeft: "auto" }}
                    type="button"
                    id={"wd-" + w.slug}
                    aria-label={"Ubah " + w.title}
                    onClick={() => setOpenSlug(w.slug)}
                  >
                    Ubah
                  </button>
                </div>
                <div className="ep">
                  <span className="muted">{w.type === "book" ? "Bab" : "Episode"}</span>
                  <b className="tnum">{progress}</b>
                  <span className="muted tnum">{w.total ? "/ " + w.total : ""}</span>
                  <button className="btn sm" style={{ marginLeft: "auto" }} type="button" aria-label={`+1 episode ${w.title}`} onClick={() => void plusOne(w)}>
                    +1 ep
                  </button>
                </div>
                {w.total ? <Bar value={Math.min(1, progress / w.total)} /> : null}
                <span className="src">
                  {w.file} · {fmtDate(w.updated)}
                </span>
              </div>
            </article>
          );
        })}
      </div>
      {list.length ? null : <p className="muted">Ga ada judul di filter ini.</p>}
      {opened ? (
        <WatchDrawer
          key={opened.slug}
          w={opened}
          onClose={() => {
            setOpenSlug(null);
            focusFirst(["wd-" + opened.slug]);
          }}
        />
      ) : null}
    </>
  );
}

/* ===== cover: upload / drop / atur posisi / hapus ===== */

function Cover({ w }: { w: WatchItem }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<CoverPos | null>(null); // lagi diatur
  const [grab, setGrab] = useState(false);
  const drag = useRef<{ px: number; py: number; x: number; y: number; ox: number; oy: number } | null>(null);
  const saved = w.coverPos ?? DEFAULT_COVER_POS;
  const pos = edit ?? saved;
  const has = !!w.cover;

  async function upload(file: File) {
    if (!file.type.startsWith("image/") || file.size > COVER_MAX_BYTES) return toast("File harus gambar, maks 5 MB");
    setBusy(true);
    setEdit(null);
    try {
      const r = await api.uploadCover(w.slug, file);
      toast("Cover disimpan", `${r.cover} · cover`);
      startTransition(() => router.refresh());
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      focusFirst(["cover-up-" + w.slug], 3000);
    }
  }

  async function remove() {
    if (!confirm(`Hapus cover "${w.title}"? File gambarnya ikut dihapus.`)) return;
    setBusy(true);
    try {
      const r = await api.removeCover(w.slug);
      toast("Cover dihapus", `${r.file} · cover${r.removedFile ? ` · ${r.removedFile} dihapus` : ""}`);
      startTransition(() => router.refresh());
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      focusFirst(["cover-up-" + w.slug], 3000);
    }
  }

  async function savePos() {
    if (!edit) return;
    const c = clampCoverPos(edit);
    setBusy(true);
    try {
      const r = await api.updateWatch(w.slug, { coverPos: c });
      toast("Posisi cover disimpan", `${r.file} · cover_pos: ${coverPosValue(c)}`);
      startTransition(() => {
        router.refresh();
        setEdit(null);
      });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      focusFirst(["cover-adj-" + w.slug], 3000);
    }
  }

  const cancel = () => {
    setEdit(null);
    focusFirst(["cover-adj-" + w.slug]);
  };
  const change = (c: CoverPos) => setEdit(clampCoverPos(c));

  // Esc batal di mana pun fokusnya selama lagi ngatur
  useEffect(() => {
    if (!edit) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setEdit(null);
        focusFirst(["cover-adj-" + w.slug]);
      }
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [edit, w.slug]);

  /** object-position + scale (origin sama) → geser 1px = 100/overflow persen. */
  function overflow(c: CoverPos) {
    const el = box.current!, img = el.querySelector("img")!;
    const bw = el.clientWidth, bh = el.clientHeight, nw = img.naturalWidth || bw, nh = img.naturalHeight || bh;
    const s = Math.max(bw / nw, bh / nh);
    return { ox: nw * s * c.z - bw, oy: nh * s * c.z - bh };
  }

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files") || busy) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDrop(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setDrop(false);
      const file = e.dataTransfer.files[0];
      if (file && !busy) void upload(file);
    },
  };

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      hidden
      aria-label={"Upload cover " + w.title}
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void upload(file);
      }}
    />
  );
  const pick = () => {
    if (!input.current) return;
    input.current.value = "";
    input.current.click();
  };

  if (has && edit) {
    return (
      <div
        ref={box}
        className={"cover has-img adjusting" + (grab ? " grabbing" : "")}
        id={"cover-" + w.slug}
        tabIndex={0}
        role="group"
        aria-label={`Atur posisi cover ${w.title}. Geser gambar, atau pakai panah. Enter simpan, Esc batal.`}
        style={posStyle(pos)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          const step = e.shiftKey ? 10 : 2;
          const mv: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
          if (mv[e.key]) {
            e.preventDefault();
            change({ ...edit, x: edit.x + mv[e.key][0], y: edit.y + mv[e.key][1] });
          } else if (e.key === "Enter") {
            e.preventDefault();
            void savePos();
          }
        }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest(".cover-adjust,.cover-acts") || e.button > 0) return;
          e.preventDefault();
          e.currentTarget.focus({ preventScroll: true });
          drag.current = { px: e.clientX, py: e.clientY, x: edit.x, y: edit.y, ...overflow(edit) };
          e.currentTarget.setPointerCapture(e.pointerId);
          setGrab(true);
        }}
        onPointerMove={(e) => {
          const s = drag.current;
          if (!s) return;
          change({
            ...edit,
            x: s.ox > 0 ? s.x - ((e.clientX - s.px) / s.ox) * 100 : edit.x,
            y: s.oy > 0 ? s.y - ((e.clientY - s.py) / s.oy) * 100 : edit.y,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
          setGrab(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setGrab(false);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- gambar dari vault lewat /api/assets */}
        <img src={coverSrc(w)} alt="" draggable={false} />
        <span className="cover-hint">Geser gambar</span>
        <div className="cover-acts">
          <button className="cover-btn" type="button" onClick={cancel} disabled={busy}>
            Batal
          </button>
          <button className="cover-btn ok" type="button" onClick={() => void savePos()} disabled={busy}>
            {busy ? "Nyimpen…" : "Simpan"}
          </button>
        </div>
        <div className="cover-adjust">
          <label htmlFor={"cover-zoom-" + w.slug}>Zoom</label>
          <input
            type="range"
            id={"cover-zoom-" + w.slug}
            min={1}
            max={3}
            step={0.05}
            value={edit.z}
            onChange={(e) => change({ ...edit, z: Number(e.target.value) })}
          />
          <button className="cover-btn" type="button" onClick={() => setEdit({ ...DEFAULT_COVER_POS })}>
            Reset
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={"cover" + (has ? " has-img" : "") + (drop ? " drop" : "")}
      id={"cover-" + w.slug}
      style={has ? posStyle(pos) : { background: gradient(w.slug) }}
      aria-busy={busy}
      {...dropProps}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- gambar dari vault lewat /api/assets */}
      {has ? <img src={coverSrc(w)} alt="" /> : null}
      <span className="cover-title">{busy ? "Nyimpen cover…" : w.title}</span>
      <div className="cover-acts">
        {has ? (
          <>
            <button
              className="cover-btn"
              type="button"
              id={"cover-adj-" + w.slug}
              aria-label={"Atur posisi cover " + w.title}
              disabled={busy}
              onClick={() => {
                setEdit({ ...saved });
                focusFirst(["cover-" + w.slug]);
              }}
            >
              {IC_MOVE}Atur
            </button>
            <button className="cover-btn" type="button" id={"cover-up-" + w.slug} aria-label={"Ganti cover " + w.title} disabled={busy} onClick={pick}>
              {IC_UP}Ganti
            </button>
            <button className="cover-btn" type="button" aria-label={"Hapus cover " + w.title} disabled={busy} onClick={() => void remove()}>
              Hapus
            </button>
          </>
        ) : (
          <button className="cover-btn" type="button" id={"cover-up-" + w.slug} aria-label={"Upload cover " + w.title} disabled={busy} onClick={pick}>
            {IC_UP}Upload cover
          </button>
        )}
      </div>
      {fileInput}
    </div>
  );
}

/* ===== tambah judul ===== */

function AddForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("anime");
  const [status, setStatus] = useState<string>("plan");
  const [total, setTotal] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="panel jform"
      style={{ marginBottom: 16 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t || busy) return;
        const n = total.trim() ? Number(total) : null;
        if (n !== null && !(Number.isInteger(n) && n >= 1)) return toast("Total episode harus angka bulat ≥ 1");
        setBusy(true);
        try {
          const r = await api.createWatch({ title: t, type, status, total: n });
          toast("Judul ditambah", r.file);
          setTitle("");
          setTotal("");
          startTransition(() => router.refresh());
        } catch (err) {
          toast((err as Error).message);
        } finally {
          setBusy(false);
          focusFirst(["watch-title"]);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="np-row">
        <div className="jfield" style={{ flex: 1, minWidth: 200 }}>
          <label htmlFor="watch-title">Judul</label>
          <input
            id="watch-title"
            autoFocus
            autoComplete="off"
            maxLength={200}
            placeholder="Judul anime / series / film / buku…"
            value={title}
            readOnly={busy}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="jfield">
          <label htmlFor="watch-type">Tipe</label>
          <select id="watch-type" className="sel" value={type} onChange={(e) => setType(e.target.value)}>
            {WATCH_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="jfield">
          <label htmlFor="watch-status">Status</label>
          <select id="watch-status" className="sel" value={status} onChange={(e) => setStatus(e.target.value)}>
            {WATCH_STATUS.map((s) => (
              <option key={s} value={s}>
                {WATCH_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="jfield" style={{ width: 110 }}>
          <label htmlFor="watch-total">Total ep</label>
          <input id="watch-total" type="text" inputMode="numeric" placeholder="opsional" value={total} onChange={(e) => setTotal(e.target.value)} />
        </div>
      </div>
      <div className="jfoot" style={{ justifyContent: "flex-end", gap: 6 }}>
        <button className="btn" type="button" onClick={onClose}>
          Tutup
        </button>
        <button className="btn primary" type="submit" disabled={busy || !title.trim()}>
          {busy ? "Nyimpen…" : "Tambah"}
        </button>
      </div>
    </form>
  );
}

/* ===== drawer: status, rating, progress, total, tipe ===== */

function WatchDrawer({ w, onClose }: { w: WatchItem; onClose: () => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);

  async function save(patch: Parameters<typeof api.updateWatch>[1], msg: string) {
    setBusy(true);
    try {
      const r = await api.updateWatch(w.slug, patch);
      if (r.changed.length) toast(msg, `${r.file} · ${r.changed.join(", ")}`);
      startTransition(() => router.refresh());
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Input angka: simpan pas blur / Enter kalau nilainya beda. */
  const numField = (id: string, label: string, val: number | null, key: "progress" | "total", min: number) => (
    <>
      <dt>
        <label htmlFor={id}>{label}</label>
      </dt>
      <dd>
        <input
          id={id}
          className="date-in"
          type="number"
          min={min}
          step={1}
          defaultValue={val ?? ""}
          key={String(val)}
          style={{ width: 110 }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const n = raw === "" ? null : Number(raw);
            if (n === val) return;
            if (key === "progress" && n === null) return void (e.target.value = String(val ?? 0));
            if (n !== null && !(Number.isInteger(n) && n >= min)) {
              toast(`${label} harus angka bulat ≥ ${min}`);
              e.target.value = val === null ? "" : String(val);
              return;
            }
            void save({ [key]: n }, `${label} disimpan`);
          }}
        />
      </dd>
    </>
  );

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={w.title}>
        <div className="drawer-h">
          <div>
            <div className="eyebrow">{w.file}</div>
            <h1 style={{ fontSize: "1.5rem" }}>{w.title}</h1>
          </div>
          <button className="btn sm x" type="button" aria-label="Tutup" onClick={onClose} autoFocus>
            ✕
          </button>
        </div>
        <dl className="fm">
          <dt>
            <label htmlFor="wstatus">status</label>
          </dt>
          <dd>
            <select id="wstatus" className="sel" value={w.status} disabled={busy} onChange={(e) => void save({ status: e.target.value }, `Status → ${WATCH_STATUS_LABEL[e.target.value as WatchItem["status"]]}`)}>
              {WATCH_STATUS.map((s) => (
                <option key={s} value={s}>
                  {WATCH_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </dd>
          <dt id="wrating">rating</dt>
          <dd>
            <div className="chip-tog" role="group" aria-labelledby="wrating">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className="chip"
                  aria-pressed={w.rating === n}
                  disabled={busy}
                  onClick={() => void save({ rating: w.rating === n ? null : n }, w.rating === n ? "Rating dihapus" : `Rating ${n}/10`)}
                >
                  {n}
                </button>
              ))}
            </div>
          </dd>
          {numField("wprog", w.type === "book" ? "Bab terakhir" : "Episode terakhir", w.progress, "progress", 0)}
          {numField("wtotal", "Total", w.total, "total", 1)}
          <dt>
            <label htmlFor="wtype">type</label>
          </dt>
          <dd>
            <select id="wtype" className="sel" value={w.type} disabled={busy} onChange={(e) => void save({ type: e.target.value }, "Tipe diganti")}>
              {[...new Set([...WATCH_TYPES, w.type])].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </dd>
        </dl>
        <div className="drawer-foot">
          <span className="src">Terakhir diubah {fmtDate(w.updated)}</span>
          <Link className="btn sm" href={`/notes?path=${encodeURIComponent(w.file)}&edit=1`}>
            Tulis catatan / kesan
          </Link>
        </div>
      </aside>
    </div>
  );
}
