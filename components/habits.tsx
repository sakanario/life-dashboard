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

/** Fokus ke elemen pertama yang ada & keliatan (dipanggil habis render ulang). */
export function focusFirst(ids: (string | null | undefined)[]) {
  setTimeout(() => {
    for (const id of ids) {
      const x = id ? document.getElementById(id) : null;
      if (x && x.getClientRects().length) return x.focus();
    }
  }, 0);
}

/**
 * Satu baris habit: klik label = selesai/batal, "Terlewat" = missed, "Batal" = kosongin lagi.
 * `streak` null = tanpa angka streak (mis. tanggal lampau di editor jurnal).
 */
export function HabitRow({
  id,
  label,
  state,
  streak,
  onSet,
  idPrefix = "hb-",
}: {
  id: string;
  label: string;
  state: HabitState;
  streak: number | null;
  onSet: (want: HabitState) => void;
  idPrefix?: string;
}) {
  const set = (want: HabitState) => {
    onSet(want);
    focusFirst([want === "missed" ? idPrefix + "undo-" + id : idPrefix + id]);
  };
  return (
    <div className={"habit" + (state ? " " + state : "")}>
      <button
        type="button"
        className="hb-tog"
        id={idPrefix + id}
        aria-pressed={state === "done"}
        aria-description={state === "missed" ? "terlewat" : undefined}
        onClick={() => set(state === "done" ? null : "done")}
      >
        <span className="hb" aria-hidden="true" />
        <span className="hb-lbl">{label}</span>
      </button>
      {state === "missed" ? (
        <span className="hb-side">
          terlewat{streak === null ? "" : " · besok lagi"}
          <button type="button" className="hb-txt" id={idPrefix + "undo-" + id} aria-label={"Batalin terlewat: " + label} onClick={() => set(null)}>
            Batal
          </button>
        </span>
      ) : state === "done" ? (
        streak === null ? null : <span className="streak">{streak ? streak + " hari" : "—"}</span>
      ) : (
        <span className="hb-side">
          <button type="button" className="hb-txt" aria-label={"Tandai " + label + " terlewat"} onClick={() => set("missed")}>
            Terlewat
          </button>
        </span>
      )}
    </div>
  );
}
