"use client";

import { useState } from "react";
import { IC_MOVE, IC_UP } from "@/components/icons";
import { Bar, RO_TITLE } from "@/components/ui";
import type { WatchItem } from "@/lib/vault/types";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const fmtDate = (s: string | null) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const [, m, d] = s.split("-").map(Number);
  return d + " " + BULAN[m - 1];
};
const STATUS_LABEL = { watching: "ditonton", plan: "rencana", done: "selesai", dropped: "drop" } as const;
const STATUS_CLASS = { watching: "st-active", plan: "st-idea", done: "st-done", dropped: "st-paused" } as const;

/** Tanpa cover: gradient yang tetap per judul (dari hash slug). */
function gradient(slug: string) {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const a = h % 360, b = (a + 40 + ((h >> 8) % 60)) % 360;
  return `linear-gradient(135deg,hsl(${a} 55% 32%),hsl(${b} 70% 72%))`;
}

export function WatchView({ items }: { items: WatchItem[] }) {
  const [f, setF] = useState<"all" | WatchItem["status"]>("all");
  const list = items.filter((w) => f === "all" || w.status === f);

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
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>
                {l}
              </button>
            ))}
          </div>
          <button className="btn" type="button" disabled title={RO_TITLE}>
            + Judul
          </button>
        </div>
      </div>
      <div className="watch-grid">
        {list.map((w) => {
          const c = w.coverPos ?? { x: 50, y: 50, z: 1 };
          const style = w.cover
            ? ({ "--cx": `${c.x}%`, "--cy": `${c.y}%`, "--cz": c.z } as React.CSSProperties)
            : { background: gradient(w.slug) };
          return (
            <article key={w.slug} className="panel watch">
              <div className={"cover" + (w.cover ? " has-img" : "")} style={style}>
                {/* eslint-disable-next-line @next/next/no-img-element -- gambar dari vault lewat /api/assets */}
                {w.cover ? <img src={`/api/assets?path=${encodeURIComponent(w.cover)}`} alt="" /> : null}
                <span className="cover-title">{w.title}</span>
                <div className="cover-acts">
                  {w.cover ? (
                    <>
                      <button className="cover-btn" type="button" disabled title={RO_TITLE}>
                        {IC_MOVE}Atur
                      </button>
                      <button className="cover-btn" type="button" disabled title={RO_TITLE}>
                        {IC_UP}Ganti
                      </button>
                      <button className="cover-btn" type="button" disabled title={RO_TITLE}>
                        Hapus
                      </button>
                    </>
                  ) : (
                    <button className="cover-btn" type="button" disabled title={RO_TITLE}>
                      {IC_UP}Upload cover
                    </button>
                  )}
                </div>
              </div>
              <div className="watch-body">
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="chip">{w.type}</span>
                  <span className={"status " + STATUS_CLASS[w.status]}>{STATUS_LABEL[w.status]}</span>
                  {w.rating !== null ? <span className="mono muted" style={{ marginLeft: "auto" }}>★ {w.rating}/10</span> : null}
                </div>
                <div className="ep">
                  <span className="muted">Episode</span>
                  <b className="tnum">{w.progress}</b>
                  <span className="muted tnum">{w.total ? "/ " + w.total : ""}</span>
                  <button className="btn sm" style={{ marginLeft: "auto" }} type="button" disabled title={RO_TITLE}>
                    +1 ep
                  </button>
                </div>
                {w.total ? <Bar value={w.progress / w.total} /> : null}
                <span className="src">
                  {w.file} · {fmtDate(w.updated)}
                </span>
              </div>
            </article>
          );
        })}
      </div>
      {list.length ? null : <p className="muted">Ga ada judul di filter ini.</p>}
    </>
  );
}
