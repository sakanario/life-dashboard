"use client";

import { useEffect, useRef, useState } from "react";

/** Drawer yang lagi ditutup tetap dirender sebentar biar animasi keluarnya jalan (datanya disimpan, item aslinya bisa udah ilang). */
export function useLeaving<T>(ms = 260) {
  const [leaving, setLeaving] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const leave = (item: T | null) => {
    clearTimeout(timer.current);
    setLeaving(item);
    if (item) timer.current = setTimeout(() => setLeaving(null), ms);
  };
  return [leaving, leave] as const;
}

/** True selama `ms` pertama sejak dipasang: buat animasi masuk yang cuma jalan sekali (bukan tiap isi berubah). */
export function useFresh(ms = 700) {
  const [fresh, setFresh] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setFresh(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return fresh;
}

/** Tandai item yang barusan muncul / pindah (class "enter") selama `ms`, lalu lepas. */
export function useEnter(ms = 2400) {
  const [slug, setSlug] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const mark = (s: string) => {
    clearTimeout(timer.current);
    setSlug(s);
    timer.current = setTimeout(() => setSlug(null), ms);
  };
  return [slug, mark] as const;
}
