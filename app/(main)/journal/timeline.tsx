"use client";

import Link from "next/link";
import { useState } from "react";
import { SlideSeg } from "@/components/slide-seg";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const fmt = (s: string) => {
  const [, m, d] = s.split("-").map(Number);
  return d + " " + BULAN[m - 1];
};
const weekday = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return HARI[new Date(y, m - 1, d).getDay()];
};

export type TimelineRow =
  | { kind: "day"; date: string; file: string; highlight: string; summary: string; tags: string[] }
  | { kind: "gap"; days: number; from: string; to: string; questsDone: number };

export function Timeline({ rows, tags, today, onEdit }: { rows: TimelineRow[]; tags: string[]; today: string; onEdit?: (date: string) => void }) {
  const [tag, setTag] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const shown = tag ? rows.filter((r) => r.kind === "day" && r.tags.includes(tag)) : rows;

  return (
    <section className="panel">
      <div className="panel-h">
        <h2>Timeline</h2>
        {tags.length ? (
          <div style={{ marginLeft: "auto" }}>
            <SlideSeg label="Filter tag" value={tag ?? ""} onChange={(t) => setTag(t || null)} options={[["", "Semua"], ...tags.map((t) => [t, "@" + t] as const)]} />
          </div>
        ) : null}
      </div>
      {/* key = tag: ganti filter → daftar dipasang ulang, hari-hari muncul berurutan lagi */}
      <div className="timeline" key={tag ?? ""}>
        {shown.map((r, i) =>
          r.kind === "gap" ? (
            <div key={"gap-" + r.from} className="day" style={{ "--i": Math.min(i, 10) } as React.CSSProperties}>
              <div className="day-date">
                <b style={{ color: "var(--warn)" }}>{r.days} hari</b>
                <span className="muted" style={{ fontSize: ".8rem" }}>
                  tanpa jurnal
                </span>
              </div>
              <div className="day-body">
                <span className="muted" style={{ fontSize: ".86rem" }}>
                  {fmt(r.from)} – {fmt(r.to)}.{r.questsDone ? ` Selama itu ada ${r.questsDone} quest selesai.` : ""}
                </span>
              </div>
            </div>
          ) : (
            <div key={r.date} className="day" style={{ "--i": Math.min(i, 10) } as React.CSSProperties}>
              <div className="day-date">
                <b>{fmt(r.date)}</b>
                <span className="muted" style={{ fontSize: ".8rem" }}>
                  {weekday(r.date)}
                  {r.date === today ? " · hari ini" : ""} · {r.date.slice(0, 4)}
                </span>
              </div>
              <div className="day-body">
                <div className="day-hl" style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ minWidth: 0 }}>{r.highlight || "(tanpa highlight)"}</span>
                  {onEdit ? (
                    <button type="button" className="more" style={{ marginLeft: "auto", flex: "none" }} aria-label={"Edit jurnal " + fmt(r.date)} onClick={() => onEdit(r.date)}>
                      Edit
                    </button>
                  ) : null}
                </div>
                {r.summary ? (
                  <>
                    <p className={"day-sum" + (open[r.date] ? " open" : "")} id={"dsum-" + r.date} style={{ whiteSpace: open[r.date] ? "pre-wrap" : undefined }}>
                      {open[r.date] ? r.summary : r.summary.replace(/\s+/g, " ")}
                    </p>
                    <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <button type="button" className="more" aria-expanded={!!open[r.date]} aria-controls={"dsum-" + r.date} onClick={() => setOpen({ ...open, [r.date]: !open[r.date] })}>
                        {open[r.date] ? "Tutup" : "Baca selengkapnya"}
                      </button>
                      <Link className="src" style={{ textDecoration: "none" }} href={`/notes?path=${encodeURIComponent(r.file)}`}>
                        {r.file}
                      </Link>
                    </span>
                  </>
                ) : (
                  <span className="muted" style={{ fontSize: ".86rem" }}>
                    Ringkasan kosong.
                  </span>
                )}
              </div>
            </div>
          ),
        )}
        {shown.length ? null : <p className="muted" style={{ margin: 0 }}>Belum ada jurnal{tag ? " dengan @" + tag : ""}.</p>}
      </div>
    </section>
  );
}
