"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Segmented control dengan pil aktif yang meluncur ke tombol terpilih. */
export function SlideSeg<K extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: K;
  options: readonly (readonly [K, string])[];
  onChange: (k: K) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const b = root.querySelector<HTMLElement>('button[aria-pressed="true"]');
      if (b) setPill({ x: b.offsetLeft, w: b.offsetWidth });
    };
    measure();
    // lebar tombol bisa berubah (font telat dimuat, layout wrap)
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [value]);

  return (
    <div className="seg slide" role="group" aria-label={label} ref={ref}>
      {pill ? <span className="seg-pill" aria-hidden="true" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} /> : null}
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}
