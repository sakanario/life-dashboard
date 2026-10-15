"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Opt = { value: string; label: string };
type Pos = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

const GAP = 6;

/**
 * Pengganti <select> yang ikut tema (kaca, pil, warna navy/oranye).
 * Daftar pilihannya di-portal ke body: panel kaca pakai backdrop-filter, popup di dalamnya bisa ketutup panel lain.
 */
export function Picker({
  value,
  options,
  onChange,
  label,
  disabled,
  className,
}: {
  value: string;
  options: Opt[];
  onChange: (v: string) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<Pos | null>(null);
  const cur = options.find((o) => o.value === value) ?? options[0];

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = innerHeight - r.bottom - GAP - 8, above = r.top - GAP - 8;
    // buka ke atas kalau ruang di bawah sempit dan di atas lebih lega
    const up = below < 180 && above > below;
    const width = Math.max(r.width, 200);
    const left = Math.min(r.left, innerWidth - width - 8);
    setPos(up ? { left, width, bottom: innerHeight - r.top + GAP, maxHeight: Math.min(280, above) } : { left, width, top: r.bottom + GAP, maxHeight: Math.min(280, below) });
  }, []);

  const show = () => {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    place();
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };
  const pick = (i: number) => {
    const o = options[i];
    if (o && o.value !== value) onChange(o.value);
    close();
  };

  useLayoutEffect(() => {
    if (!open) return;
    list.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    document.addEventListener("pointerdown", down);
    addEventListener("resize", place);
    addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      removeEventListener("resize", place);
      removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  const onListKey = (e: React.KeyboardEvent) => {
    const n = options.length;
    const go = (i: number) => {
      e.preventDefault();
      setActive(((i % n) + n) % n);
    };
    if (e.key === "ArrowDown") go(active + 1);
    else if (e.key === "ArrowUp") go(active - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(n - 1);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // jangan ikut nutup drawer
      close();
    } else if (e.key === "Tab") close(false);
    else if (e.key.length === 1) {
      // lompat ke pilihan berikutnya yang huruf awalnya cocok
      const k = e.key.toLowerCase();
      for (let s = 1; s <= n; s++) {
        const i = (active + s) % n;
        if (options[i].label.toLowerCase().startsWith(k)) return go(i);
      }
    }
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={"picker" + (className ? " " + className : "")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${label}: ${cur?.label ?? ""}`}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className="picker-v">{cur?.label}</span>
        <svg className="picker-chev" width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1 1.5l5 5 5-5" />
        </svg>
      </button>
      {open && pos
        ? createPortal(
            <ul
              ref={list}
              id={id}
              role="listbox"
              tabIndex={-1}
              aria-label={label}
              aria-activedescendant={`${id}-${active}`}
              className={"picker-list" + (pos.bottom !== undefined ? " up" : "")}
              style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
              onKeyDown={onListKey}
            >
              {options.map((o, i) => (
                <li
                  key={o.value}
                  id={`${id}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={o.value === value}
                  className={i === active ? "on" : undefined}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => pick(i)}
                >
                  <span>{o.label}</span>
                  {o.value === value ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5 10 17l9-10" />
                    </svg>
                  ) : null}
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
