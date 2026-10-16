"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast, toastInfo, toastError } from "@/components/toast";
import { api } from "@/lib/client-api";

type W = { slug: string; title: string; progress: number };

/**
 * Tombol +1 episode (kartu Watchlist & widget Hari ini). Angka langsung naik (optimistis),
 * toast-nya punya "Batal" = -1 lagi.
 */
export function useWatchEp() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [delta, setDelta] = useState<Record<string, number>>({});

  const bump = (slug: string, d: number) => setDelta((o) => ({ ...o, [slug]: (o[slug] ?? 0) + d }));
  const settle = (slug: string, d: number) =>
    startTransition(() => {
      router.refresh();
      bump(slug, -d);
    });

  async function step(w: W, d: 1 | -1) {
    bump(w.slug, d);
    try {
      const r = await api.updateWatch(w.slug, { epDelta: d });
      const st = r.changed.includes("status") ? ` · status: ${r.status}` : "";
      if (d === 1) toast(`${w.title} → ep ${r.progress}`, `${r.file} · progress${st}`, { label: "Batal", fn: () => void step(w, -1) });
      else toastInfo(`${w.title} balik ke ep ${r.progress}`, `${r.file} · progress`);
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      settle(w.slug, d);
    }
  }

  return {
    progressOf: (w: W) => Math.max(0, w.progress + (delta[w.slug] ?? 0)),
    plusOne: (w: W) => step(w, 1),
  };
}
