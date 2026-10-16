"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { api } from "@/lib/client-api";
import { focusFirst } from "./habits";
import { QuestItem, useJustAdded, type QuestRow } from "./quest";
import { toast, toastError } from "./toast";

/** Teks quest yang bisa diedit: isi baris asli (markdown & @tag tetap), tanpa checkbox & done:. */
const editable = (q: QuestRow) =>
  (q.raw ?? q.text).replace(/^\s*[-*+] \[[ xX]\][ \t]+/, "").replace(/(^|\s)done:\d{4}-\d{2}-\d{2}\b/, "").trim();

const IC_COLLAPSE = <path d="m7 20 5-5 5 5M7 4l5 5 5-5" />;
const IC_EXPAND = <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />;

/* status buka/tutup grup file di drawer proyek, diinget per browser (key = path file) */
const QG_KEY = "ld-qg-closed";
const subscribeQg = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(QG_KEY, cb);
  return () => { window.removeEventListener("storage", cb); window.removeEventListener(QG_KEY, cb); };
};
const qgSnapshot = () => { try { return localStorage.getItem(QG_KEY) || "{}"; } catch { return "{}"; } };

type ListProps<T extends QuestRow> = {
  quests: T[];
  idPrefix: string;
  isDone: (q: T) => boolean;
  onToggle: (q: T) => void;
  manage: boolean;
  readOnly?: boolean;
  readOnlyTitle?: string;
  fallbackFocus: string; // fokus ke sini kalau quest terakhir dihapus
  /** File utama (README proyek): quest-nya tampil biasa; quest di file lain dikelompokin per file, bisa dilipat. */
  mainFile?: string;
};

/**
 * Daftar quest di drawer proyek / kartu goal. Mode `manage` nampilin tombol naik/turun, edit, hapus
 * per quest (REQUIREMENTS §6.3). Urutan = urutan baris di file.
 */
export function QuestList<T extends QuestRow>(props: ListProps<T>) {
  const { quests, mainFile } = props;
  const closedRaw = useSyncExternalStore(subscribeQg, qgSnapshot, () => "{}");
  const closed = useMemo<Record<string, boolean>>(() => { try { return JSON.parse(closedRaw); } catch { return {}; } }, [closedRaw]);
  const boxRef = useRef<HTMLDivElement>(null);
  const bulkTimer = useRef<number>(undefined);

  if (!mainFile) return <Rows {...props} />;

  const main = quests.filter((q) => q.file === mainFile);
  const groups: { file: string; qs: T[] }[] = [];
  for (const q of quests) {
    if (q.file === mainFile) continue;
    const g = groups.find((x) => x.file === q.file);
    if (g) g.qs.push(q);
    else groups.push({ file: q.file, qs: [q] });
  }
  if (!groups.length) return <Rows {...props} />;

  const dir = mainFile.slice(0, mainFile.lastIndexOf("/") + 1);
  const anyOpen = groups.some((g) => !closed[g.file]);
  const save = (next: Record<string, boolean>) => {
    try { localStorage.setItem(QG_KEY, JSON.stringify(next)); } catch {}
    window.dispatchEvent(new Event(QG_KEY));
  };

  return (
    <>
      {main.length ? <Rows {...props} quests={main} /> : null}
      <div className="qg-head">
        <span>File lain</span>
        {groups.length > 1 ? (
          <button
            className="btn sm tg-all"
            type="button"
            onClick={() => {
              const next = { ...closed };
              groups.forEach((g) => (next[g.file] = anyOpen));
              // grup buka/tutup berurutan (lihat .tgroups.bulk di CSS)
              const box = boxRef.current;
              if (box) {
                box.classList.add("bulk");
                clearTimeout(bulkTimer.current);
                bulkTimer.current = window.setTimeout(() => box.classList.remove("bulk"), 300 + groups.length * 40);
              }
              save(next);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {anyOpen ? IC_COLLAPSE : IC_EXPAND}
            </svg>
            {anyOpen ? "Tutup semua" : "Buka semua"}
          </button>
        ) : null}
      </div>
      <div className="tgroups" ref={boxRef}>
        {groups.map((g, i) => {
          const open = g.qs.filter((q) => !props.isDone(q)).length;
          return (
            <details
              key={g.file}
              className="tgroup"
              style={{ "--i": i } as React.CSSProperties}
              open={!closed[g.file]}
              onToggle={(e) => {
                const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                if (isOpen === !closed[g.file]) return;
                save({ ...closed, [g.file]: !isOpen });
              }}
            >
              <summary aria-label={`${g.file.slice(dir.length)}, ${open} terbuka dari ${g.qs.length}`}>
                <span className="mono qg-name">{g.file.slice(dir.length)}</span>
                <span className="n">
                  {open}/{g.qs.length}
                </span>
              </summary>
              <Rows {...props} quests={g.qs} />
            </details>
          );
        })}
      </div>
    </>
  );
}

function Rows<T extends QuestRow>({ quests, idPrefix, isDone, onToggle, manage, readOnly, readOnlyTitle, fallbackFocus }: ListProps<T>) {
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
