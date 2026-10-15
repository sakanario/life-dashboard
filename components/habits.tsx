"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { api } from "@/lib/client-api";
import { toast } from "./toast";

export type HabitState = "done" | "missed" | null;

/** Set status habit secara optimistis; klik beruntun per habit dikirim berurutan (yang terakhir menang). */
export function useHabitSetter(date: string) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [over, setOver] = useState<Record<string, HabitState>>({});
  const jobs = useRef(new Map<string, { want: HabitState; running: boolean }>());

  const stateOf = useCallback((id: string, server: HabitState) => (id in over ? over[id] : server), [over]);

  const set = useCallback(
    (id: string, label: string, server: HabitState, want: HabitState) => {
      setOver((o) => ({ ...o, [id]: want }));
      const existing = jobs.current.get(id);
      if (existing) {
        existing.want = want;
        return;
      }
      const job = { want, running: true };
      jobs.current.set(id, job);
      void (async () => {
        let sent: HabitState = server;
        try {
          while (job.want !== sent) {
            const w = job.want;
            const r = await api.saveJournal(date, { habits: { [id]: w } });
            sent = w;
            if (job.want === sent) {
              const where = `${r.file.split("/").pop()} · habits.${id}${w ? ": " + w : ""}`;
              toast(w === "done" ? `${label}: selesai` : w === "missed" ? "Oke, besok lagi" : "Dibatalin", where);
            }
          }
        } catch (e) {
          toast((e as Error).message);
        } finally {
          jobs.current.delete(id);
          startTransition(() => {
            router.refresh();
            setOver((o) => {
              const n = { ...o };
              delete n[id];
              return n;
            });
          });
        }
      })();
    },
    [date, router],
  );

  return { stateOf, set };
}
