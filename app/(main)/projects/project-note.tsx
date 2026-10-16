"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { focusFirst } from "@/components/habits";
import { toast, toastInfo, toastWarn } from "@/components/toast";
import { api, ApiError } from "@/lib/client-api";

/** [[target|alias]] / [[target]] → teks biasa buat mode baca (isi file tetap apa adanya). */
const readable = (s: string) => s.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]|#]+)(?:#[^\]]*)?\]\]/g, "$1");

/**
 * Catatan bebas proyek (deskripsi / proses berpikir) = area di README sebelum "## Quest".
 * Klik buat nulis; Ctrl S simpan, Esc batal. Konflik dicek pakai isi lama (`base`).
 */
export function ProjectNote({ slug, raw, readOnly }: { slug: string; raw: string; readOnly: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState(raw);
  const [text, setText] = useState(raw);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);
  // abis simpan, tampilin teks baru duluan sebelum data server ke-refresh
  const [saved, setSaved] = useState<string | null>(null);
  const shown = saved ?? raw;
  const dirty = editing && text !== base;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const open = () => {
    if (readOnly) return;
    setBase(shown);
    setText(shown);
    setConflict(null);
    setAskDiscard(false);
    setEditing(true);
    focusFirst(["pnote-src"]);
  };
  const close = () => {
    setEditing(false);
    setAskDiscard(false);
    setConflict(null);
    focusFirst(["pnote-edit"]);
  };

  async function save(over?: string) {
    if (busy) return;
    if (!dirty && over === undefined) return close();
    setBusy(true);
    try {
      const r = await api.setProjectDesc(slug, text, over ?? base);
      if (r.changed) toast("Catatan proyek disimpan", `${r.file} · deskripsi`);
      else toastInfo("Ga ada yang berubah", r.file);
      setSaved(text.trim());
      close();
      startTransition(() => router.refresh());
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const d = e.detail as { desc?: string } | null;
        setConflict(d?.desc ?? "");
        toastWarn("README berubah dari luar. Cek dulu sebelum nimpa.");
      } else toastWarn((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing)
    return shown ? (
      <div className={"pnote" + (readOnly ? "" : " can-edit")} onClick={open}>
        <p className="pnote-text">{readable(shown)}</p>
        {readOnly ? null : (
          <button
            type="button"
            className="more pnote-btn"
            id="pnote-edit"
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
          >
            Edit catatan
          </button>
        )}
      </div>
    ) : readOnly ? null : (
      <button type="button" className="pnote-empty" id="pnote-edit" onClick={open}>
        Tulis deskripsi / proses berpikir…
      </button>
    );

  return (
    <form
      className="pnote-form"
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
          e.stopPropagation(); // jangan ikut nutup drawer
          if (dirty) setAskDiscard(true);
          else close();
        }
      }}
    >
      {conflict !== null ? (
        <div className="arc-banner" role="alert">
          <span>README proyek ini diubah dari luar (Claude / Obsidian) sejak kamu mulai nulis.</span>
          <button
            className="btn sm"
            type="button"
            onClick={() => {
              setBase(conflict);
              setText(conflict);
              setConflict(null);
            }}
          >
            Pakai versi file
          </button>
          <button className="btn sm danger" type="button" disabled={busy} onClick={() => void save(conflict)}>
            Timpa pakai punyaku
          </button>
        </div>
      ) : null}
      <label htmlFor="pnote-src" className="sr-only">
        Deskripsi / catatan proyek
      </label>
      <textarea
        id="pnote-src"
        className="pnote-src"
        value={text}
        rows={Math.min(18, Math.max(5, text.split("\n").length + 1))}
        placeholder="Deskripsi proyek, ide, proses berpikir… (markdown & [[link]] boleh)"
        // kursor ke akhir teks: biasanya lanjut nulis di bawah
        onFocus={(e) => {
          const n = e.currentTarget.value.length;
          e.currentTarget.setSelectionRange(n, n);
        }}
        onChange={(e) => setText(e.target.value)}
      />
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
                focusFirst(["pnote-src"]);
              }}
            >
              Lanjut nulis
            </button>
          </div>
        </div>
      ) : null}
      <div className="pnote-foot">
        <span className="hint" aria-live="polite">
          {dirty ? "belum disimpan" : "ga ada perubahan"}
          <span className="kbd" style={{ marginLeft: 8 }}>Ctrl S</span>
        </span>
        <button className="btn sm" type="button" onClick={() => (dirty ? setAskDiscard(true) : close())}>
          Batal
        </button>
        <button className="btn sm primary" type="submit" disabled={busy}>
          {busy ? "Nyimpen…" : "Simpan"}
        </button>
      </div>
    </form>
  );
}
