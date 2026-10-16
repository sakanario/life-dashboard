"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { focusFirst } from "@/components/habits";
import { toast } from "@/components/toast";
import { api, ApiError } from "@/lib/client-api";

type Base = { raw: string; mtime: number };

/** Ganti URL (?edit=1) tanpa render ulang server; state null biar router Next ikut ke-sync. */
function syncEdit(on: boolean) {
  const u = new URL(location.href);
  if (on) u.searchParams.set("edit", "1");
  else u.searchParams.delete("edit");
  history.replaceState(null, "", u);
}

/**
 * Panel catatan: mode baca (markdown dirender server, dioper lewat `children`) atau mode edit
 * (isi mentah file, termasuk frontmatter). Konflik dicek pakai mtime (REQUIREMENTS §8).
 */
export function NoteDoc({ path, initialEdit, children }: { path: string; initialEdit: boolean; children: ReactNode }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState<Base | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Base | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);
  // balik dari editor → mode baca masuk halus (pas halaman dibuka biar .doc-swap yang animasiin)
  const [back, setBack] = useState(false);
  const dirty = editing && base !== null && text !== base.raw;

  async function open() {
    setBusy(true);
    try {
      const res = await fetch(`/api/notes?path=${encodeURIComponent(path)}&raw=1`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Gagal buka catatan");
      setBase({ raw: d.raw, mtime: d.mtime });
      setText(d.raw);
      setConflict(null);
      setAskDiscard(false);
      setEditing(true);
      syncEdit(true);
      focusFirst(["note-src"]);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ?edit=1 (mis. dari tombol "Edit script" di drawer konten) → langsung buka editor
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!initialEdit || autoOpened.current) return;
    // ref ditandai di dalam timer: di StrictMode effect jalan 2x & timer pertama dibatalin cleanup
    const t = setTimeout(() => {
      autoOpened.current = true;
      void open();
    }, 0);
    return () => clearTimeout(t);
    // open() sengaja ga masuk deps: cuma sekali waktu halaman dibuka
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEdit]);

  // jangan sampai ketikan ilang karena tab ketutup / reload
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const close = () => {
    setEditing(false);
    setBack(true);
    setAskDiscard(false);
    setConflict(null);
    syncEdit(false);
    focusFirst(["note-edit-btn"]);
  };

  async function save(force = false) {
    if (!base || busy) return;
    if (!dirty && !force) return close();
    setBusy(true);
    try {
      const r = await api.saveNote(path, text, base.mtime, force);
      toast("Catatan disimpan", r.path);
      setBase({ raw: text, mtime: r.mtime });
      close();
      startTransition(() => router.refresh());
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const d = e.detail as Base | null;
        if (d) setConflict(d);
        toast("Catatan berubah dari luar. Cek dulu sebelum nimpa.");
      } else toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing)
    return (
      <div className={back ? "note-read" : undefined}>
        <div className="panel-h" style={{ marginBottom: 4 }}>
          <span className="src">{path}</span>
          <button className="btn sm" id="note-edit-btn" style={{ marginLeft: "auto" }} type="button" disabled={busy} onClick={() => void open()}>
            {busy ? "Buka…" : "Edit"}
          </button>
        </div>
        {children}
      </div>
    );

  return (
    <form
      className="note-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "s" || e.key === "Enter")) {
          e.preventDefault();
          void save();
        } else if (e.key === "Escape") {
          e.preventDefault();
          if (dirty) setAskDiscard(true);
          else close();
        }
      }}
    >
      <div className="panel-h" style={{ marginBottom: 4, flexWrap: "wrap" }}>
        <span className="src">{path}</span>
        <span className="hint" style={{ marginLeft: "auto" }} aria-live="polite">
          {dirty ? "belum disimpan" : "ga ada perubahan"}
          <span className="kbd" style={{ marginLeft: 8 }}>Ctrl S</span>
        </span>
      </div>
      {conflict ? (
        <div className="arc-banner" role="alert">
          <span>File ini diubah dari luar (Claude / Obsidian) sejak kamu buka editornya.</span>
          <button
            className="btn sm"
            type="button"
            onClick={() => {
              setBase(conflict);
              setText(conflict.raw);
              setConflict(null);
            }}
          >
            Pakai versi file
          </button>
          <button className="btn sm danger" type="button" disabled={busy} onClick={() => void save(true)}>
            Timpa pakai punyaku
          </button>
        </div>
      ) : null}
      <label htmlFor="note-src" className="sr-only">
        Isi {path}
      </label>
      <textarea id="note-src" className="note-src" value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} />
      {askDiscard ? (
        <div className="confirm pop-in" role="group" aria-label="Buang perubahan">
          <p>Perubahan belum disimpan. Buang?</p>
          <div className="row">
            <button className="btn sm danger" type="button" autoFocus onClick={close}>
              Ya, buang
            </button>
            <button
              className="btn sm"
              type="button"
              onClick={() => {
                setAskDiscard(false);
                focusFirst(["note-src"]);
              }}
            >
              Lanjut edit
            </button>
          </div>
        </div>
      ) : null}
      <div className="jfoot" style={{ justifyContent: "flex-end" }}>
        <button className="btn" type="button" onClick={() => (dirty ? setAskDiscard(true) : close())}>
          Batal
        </button>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Nyimpen…" : "Simpan"}
        </button>
      </div>
    </form>
  );
}
