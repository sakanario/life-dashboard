"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/client-api";
import { focusFirst } from "./habits";
import { QuestItem, useJustAdded, type QuestRow } from "./quest";
import { toast, toastError } from "./toast";

/** Teks quest yang bisa diedit: isi baris asli (markdown & @tag tetap), tanpa checkbox & done:. */
const editable = (q: QuestRow) =>
  (q.raw ?? q.text).replace(/^\s*[-*+] \[[ xX]\][ \t]+/, "").replace(/(^|\s)done:\d{4}-\d{2}-\d{2}\b/, "").trim();

/**
 * Daftar quest di drawer proyek / kartu goal. Mode `manage` nampilin tombol naik/turun, edit, hapus
 * per quest (REQUIREMENTS §6.3). Urutan = urutan baris di file.
 */
export function QuestList<T extends QuestRow>({
  quests,
  idPrefix,
  isDone,
  onToggle,
  manage,
  readOnly,
  readOnlyTitle,
  fallbackFocus,
}: {
  quests: T[];
  idPrefix: string;
  isDone: (q: T) => boolean;
  onToggle: (q: T) => void;
  manage: boolean;
  readOnly?: boolean;
  readOnlyTitle?: string;
  fallbackFocus: string; // fokus ke sini kalau quest terakhir dihapus
}) {
  return (
    <ul className="tasks">
      {quests.map((q, i) =>
        manage && !readOnly ? (
          <ManagedRow
            key={q.id}
            q={q}
            done={isDone(q)}
            idPrefix={idPrefix}
            onToggle={onToggle}
            first={i === 0 || quests[i - 1].file !== q.file}
            last={i === quests.length - 1 || quests[i + 1].file !== q.file}
            hasSub={quests[i + 1]?.file === q.file && quests[i + 1].depth > q.depth}
            fallbackFocus={fallbackFocus}
          />
        ) : (
          <QuestItem
            key={q.id}
            q={q}
            done={isDone(q)}
            idPrefix={idPrefix}
            readOnly={readOnly}
            readOnlyTitle={readOnlyTitle}
            onToggle={(x) => {
              onToggle(x);
              focusFirst([idPrefix + x.id]);
            }}
          />
        ),
      )}
    </ul>
  );
}

function ManagedRow<T extends QuestRow>({
  q,
  done,
  idPrefix,
  onToggle,
  first,
  last,
  hasSub,
  fallbackFocus,
}: {
  q: T;
  done: boolean;
  idPrefix: string;
  onToggle: (q: T) => void;
  first: boolean;
  last: boolean;
  hasSub: boolean;
  fallbackFocus: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const pid = (k: string, id = q.id) => `${idPrefix}${k}-${id}`;
  const enter = useJustAdded(q.id);

  async function run<R>(fn: () => Promise<R>, after: (r: R) => void) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fn();
      after(r);
      startTransition(() => router.refresh());
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const move = (dir: "up" | "down") =>
    run(
      () => api.moveQuest(q.id, q.text, dir),
      (r) => {
        toast(dir === "up" ? "Quest naik" : "Quest turun", `${r.file}:${r.line}`);
        focusFirst([pid(dir, r.id), pid(dir === "up" ? "down" : "up", r.id)], 2000);
      },
    );

  const save = () => {
    const next = draft.trim();
    if (!next || next === editable(q)) {
      setMode("view");
      focusFirst([pid("edit")]);
      return;
    }
    void run(
      () => api.editQuest(q.id, q.text, next),
      (r) => {
        toast("Teks quest diganti", `${r.file}:${r.line}`);
        setMode("view");
        focusFirst([pid("edit", r.id)], 2000);
      },
    );
  };

  const remove = (li: HTMLElement | null) => {
    // ID quest di bawahnya ikut geser, jadi fokus dicari lewat posisi baris setelah data baru datang
    const ul = li?.parentElement, idx = ul ? [...ul.children].indexOf(li!) : -1, before = ul?.children.length ?? 0;
    return run(
      () => api.deleteQuest(q.id, q.text),
      (r) => {
        toast(r.removed > 1 ? `Quest + ${r.removed - 1} baris di bawahnya dihapus` : "Quest dihapus", `${r.file}:${r.line}`);
        const t0 = Date.now();
        const tick = () => {
          if (ul?.isConnected && ul.children.length < before) {
            const row = ul.children[Math.min(idx, ul.children.length - 1)];
            const b = row?.querySelector<HTMLElement>(".check");
            return b ? b.focus() : focusFirst([fallbackFocus]);
          }
          if (Date.now() - t0 < 2000) setTimeout(tick, 50);
          else focusFirst([fallbackFocus]);
        };
        setTimeout(tick, 0);
      },
    );
  };

  return (
    <li className={"task has-act" + (done ? " done" : "") + (enter ? " enter" : "")} style={q.depth ? { paddingLeft: q.depth * 18 } : undefined}>
      <button
        className="check"
        type="button"
        id={idPrefix + q.id}
        aria-pressed={done}
        aria-label={(done ? "Batal selesai: " : "Tandai selesai: ") + q.text}
        onClick={() => {
          onToggle(q);
          focusFirst([idPrefix + q.id]);
        }}
      />
      {mode === "edit" ? (
        <form
          className="t-edit"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            id={pid("ed")}
            aria-label={"Teks quest: " + q.text}
            value={draft}
            maxLength={500}
            autoComplete="off"
            readOnly={busy}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation(); // jangan ikut nutup drawer
                setMode("view");
                focusFirst([pid("edit")]);
              }
            }}
          />
          <button className="btn sm primary" type="submit" disabled={busy}>
            Simpan
          </button>
          <button
            className="btn sm"
            type="button"
            onClick={() => {
              setMode("view");
              focusFirst([pid("edit")]);
            }}
          >
            Batal
          </button>
        </form>
      ) : (
        <div>
          <div className="t-text">{q.text}</div>
          <div className="t-meta">
            {q.tags.map((t) => (
              <span key={t} className="chip">
                @{t}
              </span>
            ))}
            <span className="src">
              {q.file}:{q.line}
            </span>
          </div>
          {mode === "confirm" ? (
            <div className="confirm t-confirm" role="group" aria-label="Konfirmasi hapus">
              <p>
                Hapus quest ini{hasSub ? " beserta subquest-nya" : ""}? Barisnya hilang dari <span className="mono">{q.file}</span>.
              </p>
              <div className="row">
                <button className="btn sm danger" type="button" id={pid("delyes")} disabled={busy} onClick={(e) => void remove(e.currentTarget.closest("li"))}>
                  Ya, hapus
                </button>
                <button
                  className="btn sm"
                  type="button"
                  onClick={() => {
                    setMode("view");
                    focusFirst([pid("del")]);
                  }}
                >
                  Batal
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
      {mode === "edit" ? null : (
        <div className="t-act" role="group" aria-label={"Atur: " + q.text}>
          <button className="btn sm ic" type="button" id={pid("up")} aria-label="Naikkan" title="Naikkan" disabled={busy || first} onClick={() => void move("up")}>
            ↑
          </button>
          <button className="btn sm ic" type="button" id={pid("down")} aria-label="Turunkan" title="Turunkan" disabled={busy || last} onClick={() => void move("down")}>
            ↓
          </button>
          <button
            className="btn sm"
            type="button"
            id={pid("edit")}
            disabled={busy}
            onClick={() => {
              setDraft(editable(q));
              setMode("edit");
            }}
          >
            Edit
          </button>
          <button
            className="btn sm danger"
            type="button"
            id={pid("del")}
            disabled={busy}
            aria-expanded={mode === "confirm"}
            onClick={() => {
              setMode("confirm");
              focusFirst([pid("delyes")]);
            }}
          >
            Hapus
          </button>
        </div>
      )}
    </li>
  );
}
