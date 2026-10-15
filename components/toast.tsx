"use client";

import { useEffect, useRef, useState } from "react";

type ToastMsg = { msg: string; file?: string; action?: { label: string; fn: () => void } };

const EVT = "ld-toast";

/** Tampilkan toast (gaya mockup): pesan + file yang diubah. */
export function toast(msg: string, file?: string, action?: ToastMsg["action"]) {
  window.dispatchEvent(new CustomEvent<ToastMsg>(EVT, { detail: { msg, file, action } }));
}

export function Toaster() {
  const [t, setT] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<ToastMsg>).detail;
      clearTimeout(timer.current);
      setT(d);
      timer.current = setTimeout(() => setT(null), d.action ? 5200 : 2800);
    };
    window.addEventListener(EVT, on);
    return () => {
      window.removeEventListener(EVT, on);
      clearTimeout(timer.current);
    };
  }, []);

  return (
    <div className="toast" role="status" aria-live="polite" hidden={!t}>
      {t ? (
        <>
          <span>
            {t.msg}
            {t.file ? <span className="mono"> → {t.file}</span> : null}
          </span>
          {t.action ? (
            <button
              className="btn sm"
              type="button"
              onClick={() => {
                clearTimeout(timer.current);
                setT(null);
                t.action!.fn();
              }}
            >
              {t.action.label}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
