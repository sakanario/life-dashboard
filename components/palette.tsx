"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { NAV } from "./icons";

export type PaletteItem = { label: string; kind: string; href: string };

export function Palette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const all = useMemo<PaletteItem[]>(
    () => [
      { label: "+ Catat jurnal", kind: "aksi", href: "/?jurnal=1" },
      { label: "+ Quest ke Uncategorize", kind: "aksi", href: "/#quest" },
      { label: "+ Ide konten", kind: "aksi", href: "/content" },
      ...NAV.map((n) => ({ label: n.label, kind: "halaman", href: n.href })),
      ...items,
    ],
    [items],
  );
  const shown = useMemo(() => {
    const s = q.toLowerCase();
    return all.filter((x) => x.label.toLowerCase().includes(s)).slice(0, 9);
  }, [all, q]);

  useEffect(() => input.current?.focus(), []);

  const run = (i: number) => {
    const x = shown[i];
    if (!x) return;
    onClose();
    router.push(x.href);
  };

  return (
    <div className="pal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pal" role="dialog" aria-modal="true" aria-label="Cari">
        <input
          ref={input}
          placeholder="Ketik nama proyek, halaman, catatan, atau aksi…"
          autoComplete="off"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === "Enter") run(sel);
            if (e.key === "Escape") onClose();
          }}
        />
        <ul>
          {shown.length ? (
            shown.map((x, i) => (
              <li key={x.kind + x.href + x.label}>
                <button type="button" className={i === sel ? "sel" : ""} onClick={() => run(i)} onMouseEnter={() => setSel(i)}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.label}</span>
                  <span className="chip k">{x.kind}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="muted" style={{ padding: 10 }}>Ga ketemu</li>
          )}
        </ul>
      </div>
    </div>
  );
}
