"use client";

import { useEffect, useRef, useState } from "react";

type Kind = "ok" | "info" | "warn" | "error";
type Action = { label: string; fn: () => void };
type ToastMsg = { msg: string; file?: string; action?: Action; kind: Kind };
type Shown = ToastMsg & { id: number; ms: number };

const EVT = "ld-toast";
const OUT_MS = 220; // lama animasi keluar

// lama tampil per jenis; yang ada tombol aksi dikasih lebih lama biar sempat diklik
const MS: Record<Kind, number> = { ok: 2600, info: 2600, warn: 4000, error: 4500 };
const ACTION_MS = 5000;

const send = (kind: Kind) => (msg: string, file?: string, action?: Action) =>
  window.dispatchEvent(new CustomEvent<ToastMsg>(EVT, { detail: { msg, file, action, kind } }));

/** Toast berhasil (hijau): pesan + file yang diubah. */
export const toast = send("ok");
/** Toast netral (navy): ga ada yang berubah, dibatalin, dsb. */
export const toastInfo = send("info");
/** Toast peringatan (oranye): input salah, file berubah dari luar. */
export const toastWarn = send("warn");
/** Toast gagal (merah). */
export const toastError = send("error");

export function Toaster() {
  const [t, setT] = useState<Shown | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const outTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);
  const end = useRef(0); // kapan toast mulai keluar (ms epoch)
  const left = useRef(0); // sisa waktu pas lagi di-hover

  // geser keluar dulu, baru dilepas
  const hide = () => {
    clearTimeout(timer.current);
    setLeaving(true);
    outTimer.current = setTimeout(() => {
      setT(null);
      setLeaving(false);
      setPaused(false);
    }, OUT_MS);
  };
  const schedule = (ms: number) => {
    clearTimeout(timer.current);
    end.current = Date.now() + ms;
    timer.current = setTimeout(hide, ms);
  };

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<ToastMsg>).detail;
      const ms = d.action ? Math.max(ACTION_MS, MS[d.kind]) : MS[d.kind];
      clearTimeout(outTimer.current);
      setT({ ...d, id: ++seq.current, ms });
      setLeaving(false);
      setPaused(false);
      schedule(ms);
    };
    window.addEventListener(EVT, on);
    return () => {
      window.removeEventListener(EVT, on);
      clearTimeout(timer.current);
      clearTimeout(outTimer.current);
    };
    // hide/schedule cuma nyentuh ref & setter (stabil)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={"toast " + (t?.kind ?? "ok") + (leaving ? " leaving" : "") + (paused ? " paused" : "")}
      role={t?.kind === "error" ? "alert" : "status"}
      aria-live={t?.kind === "error" ? "assertive" : "polite"}
      hidden={!t}
      // hover = waktu berhenti, biar sempat klik Urungkan
      onMouseEnter={() => {
        if (!t || leaving) return;
        clearTimeout(timer.current);
        left.current = Math.max(800, end.current - Date.now());
        setPaused(true);
      }}
      onMouseLeave={() => {
        if (!t || leaving || !paused) return;
        setPaused(false);
        schedule(left.current);
      }}
    >
      {/* seluruh toast = progress bar: lapisan terang menyusut kanan → kiri sesuai sisa waktu */}
      {t ? <i className="toast-bar" key={"bar" + t.id} aria-hidden="true" style={{ animationDuration: t.ms + "ms" }} /> : null}
      {t ? (
        // di-key per toast: toast baru pas yang lama masih tampil → isinya "nendang" sedikit
        <span className="toast-body" key={t.id}>
          <span>
            {t.msg}
            {t.file ? <span className="mono"> → {t.file}</span> : null}
          </span>
          {t.action ? (
            <button
              className="btn sm"
              type="button"
              onClick={() => {
                hide();
                t.action!.fn();
              }}
            >
              {t.action.label}
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
