"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api, ApiError } from "@/lib/client-api";
import { toast, toastWarn, toastError } from "./toast";

const wc = (s: string) => (s.trim().match(/\S+/g) || []).length;
type Draft = { hl: string; sum: string; base: { hl: string; sum: string } };

/**
 * Form highlight + ringkasan. Ketikan yang belum disimpan tetap ada walau data server
 * di-refresh (live update); kalau file diubah dari luar, kasih tahu, jangan timpa diam-diam.
 */
export function JournalForm({
  date,
  highlight,
  summary,
  savedAt,
  questsDone,
  idPrefix = "j",
}: {
  date: string;
  highlight: string;
  summary: string;
  savedAt: string | null;
  questsDone: string[];
  idPrefix?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);

  const server = { hl: highlight, sum: summary };
  const hl = draft?.hl ?? server.hl;
  const sum = draft?.sum ?? server.sum;
  const changedOutside = !!draft && (draft.base.hl !== server.hl || draft.base.sum !== server.sum);

  const edit = (next: Partial<Pick<Draft, "hl" | "sum">>) =>
    setDraft((d) => ({ hl: d?.hl ?? server.hl, sum: d?.sum ?? server.sum, base: d?.base ?? server, ...next }));

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      // cuma field yang diubah yang dikirim, biar bagian file lain ga ikut dirapiin
      const hlChanged = draft.hl !== draft.base.hl, sumChanged = draft.sum !== draft.base.sum;
      const r = await api.saveJournal(date, {
        highlight: hlChanged ? draft.hl : undefined,
        summary: sumChanged ? draft.sum : undefined,
        base: { highlight: draft.base.hl, summary: draft.base.sum },
      });
      toast(r.created ? "Jurnal dibuat & disimpan" : "Jurnal disimpan", r.file);
      setConflict(false);
      startTransition(() => {
        router.refresh();
        setDraft(null);
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        toastWarn("Jurnal berubah dari luar. Cek dulu sebelum nimpa.");
      } else toastError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="jform"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div className="jfield">
        <label htmlFor={idPrefix + "-hl"}>Highlight</label>
        <input type="text" id={idPrefix + "-hl"} value={hl} onChange={(e) => edit({ hl: e.target.value })} placeholder="Satu hal paling penting hari ini" autoComplete="off" />
      </div>
      <div className="jfield">
        <label htmlFor={idPrefix + "-sum"}>Ringkasan</label>
        <textarea id={idPrefix + "-sum"} rows={6} value={sum} onChange={(e) => edit({ sum: e.target.value })} placeholder="Hari ini ngapain aja? Bebas, 1–3 paragraf atau beberapa bullet." />
      </div>
      {questsDone.length ? (
        <div className="jfield">
          <label>Quest selesai ({questsDone.length})</label>
          <ul className="jdone">
            {questsDone.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {changedOutside || conflict ? (
        <div className="arc-banner" role="alert">
          <span>File jurnal ini berubah dari luar (Claude / Obsidian) sejak kamu mulai ngetik.</span>
          <button className="btn sm" type="button" onClick={() => { setDraft(null); setConflict(false); }}>
            Pakai versi file
          </button>
          {conflict ? (
            <button
              className="btn sm danger"
              type="button"
              onClick={() => {
                setDraft((d) => (d ? { ...d, base: server } : d));
                setConflict(false);
              }}
            >
              Timpa pakai punyaku
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="jfoot">
        <span className="hint" aria-live="polite">
          {wc(sum)} kata · {draft ? "belum disimpan" : savedAt ? `terakhir disimpan ${savedAt}` : "belum disimpan"}
          <span className="kbd" style={{ marginLeft: 8 }}>Ctrl Enter</span>
        </span>
        <button className="btn primary" type="submit" disabled={!draft || saving}>
          {saving ? "Nyimpen…" : "Simpan"}
        </button>
      </div>
    </form>
  );
}
