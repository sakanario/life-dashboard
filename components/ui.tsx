/** Potongan UI kecil yang dipakai bareng (server-safe). */

export function Loading({ label = "Baca vault…" }: { label?: string }) {
  return (
    <div className="head">
      <div>
        <div className="eyebrow">memuat</div>
        <h1 className="muted">{label}</h1>
      </div>
    </div>
  );
}

export function Chip({ type, children }: { type?: string | null; children: React.ReactNode }) {
  return <span className={"chip" + (type ? " " + type : "")}>{children}</span>;
}

export function ArcChip({ show }: { show: boolean }) {
  return show ? (
    <span className="chip arc" title="Proyek diarsip">
      arsip
    </span>
  ) : null;
}

export function Bar({ value, good }: { value: number; good?: boolean }) {
  return (
    <div className={"bar" + (good ? " good" : "")}>
      <i style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

/** Tombol tulis yang belum diaktifin (fasenya belum dikerjain). */
export const RO_TITLE = "Belum bisa dari app (nyusul di fase berikutnya).";
