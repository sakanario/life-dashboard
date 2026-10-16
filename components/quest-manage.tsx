"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
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
  /** Drag & drop buat ubah urutan (pegangan ⋮⋮ di kiri; jalan juga di layar sentuh). */
  reorder?: boolean;
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

/* ===== drag & drop urutan quest ===== */

type Place = "before" | "after";
type Drop = { id: string; place: Place };

/** Ujung blok quest (dia + subquest-nya) di daftar: indeks sesudah anak terakhir. */
function blockEndIdx(list: QuestRow[], i: number) {
  let j = i + 1;
  while (j < list.length && list[j].file === list[i].file && list[j].depth > list[i].depth) j++;
  return j;
}
/** Indeks quest yang sejajar (file, kedalaman & induk sama) dengan list[i], urut. */
function siblingIdx(list: QuestRow[], i: number) {
  const parentOf = (k: number) => {
    for (let j = k - 1; j >= 0 && list[j].file === list[k].file; j--) if (list[j].depth < list[k].depth) return j;
    return -1;
  };
  const p = parentOf(i);
  return list.map((_, k) => k).filter((k) => list[k].file === list[i].file && list[k].depth === list[i].depth && parentOf(k) === p);
}
/** Urutan ID baru sesudah blok `id` dipindah ke sebelum / sesudah blok `drop.id`. */
function reorderIds(list: QuestRow[], id: string, drop: Drop) {
  const i = list.findIndex((q) => q.id === id);
  const block = list.slice(i, blockEndIdx(list, i));
  const rest = list.filter((q) => !block.includes(q));
  const t = rest.findIndex((q) => q.id === drop.id);
  const at = drop.place === "before" ? t : blockEndIdx(rest, t);
  return [...rest.slice(0, at), ...block, ...rest.slice(at)].map((q) => q.id);
}

const GRIP = (
  <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
    <circle cx="2.5" cy="3" r="1.4" />
    <circle cx="7.5" cy="3" r="1.4" />
    <circle cx="2.5" cy="8" r="1.4" />
    <circle cx="7.5" cy="8" r="1.4" />
    <circle cx="2.5" cy="13" r="1.4" />
    <circle cx="7.5" cy="13" r="1.4" />
  </svg>
);

/**
 * Drag & drop urutan quest. Mulai dari pegangan (pointer events → mouse & sentuh sama; `touch-action:none`
 * di pegangan biar layar ga ikut scroll), garis aksen nunjukin posisi jatuh, drawer auto-scroll di dekat tepi.
 * Urutan diganti optimistis, lalu dikirim ke server (subquest ikut pindah).
 */
function useQuestDrag<T extends QuestRow>(quests: T[], enabled: boolean) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const ulRef = useRef<HTMLUListElement>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const [seen, setSeen] = useState(quests);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  // data server baru (abis refresh) → buang urutan optimistis
  if (seen !== quests) {
    setSeen(quests);
    setOrder(null);
  }
  const byId = new Map(quests.map((q) => [q.id, q]));
  const fromOrder = order?.map((id) => byId.get(id)).filter((q): q is T => !!q);
  const shown = fromOrder && fromOrder.length === quests.length ? fromOrder : quests;

  async function commit(q: T, d: Drop) {
    const target = byId.get(d.id);
    if (!target) return;
    setOrder(reorderIds(shown, q.id, d));
    setBusy(true);
    try {
      const r = await api.moveQuestTo(q.id, q.text, target.id, target.text, d.place);
      toast("Urutan quest diubah", `${r.file}:${r.line}`);
      startTransition(() => router.refresh());
    } catch (e) {
      setOrder(null);
      toastError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const start = (e: React.PointerEvent<HTMLElement>, q: T) => {
    if (!enabled || busy || e.button !== 0 || !ulRef.current) return;
    e.preventDefault();
    const grip = e.currentTarget;
    try {
      grip.setPointerCapture(e.pointerId);
    } catch {}
    const ul = ulRef.current;
    const scroller = ul.closest<HTMLElement>(".drawer") ?? document.scrollingElement ?? document.documentElement;
    const i = shown.findIndex((x) => x.id === q.id);
    const blockIds = shown.slice(i, blockEndIdx(shown, i)).map((x) => x.id);
    const sibs = siblingIdx(shown, i).filter((k) => k !== i).map((k) => ({ id: shown[k].id, lastId: shown[blockEndIdx(shown, k) - 1].id, k }));
    const rows = () => new Map([...ul.querySelectorAll<HTMLElement>(":scope > li[data-qid]")].map((li) => [li.dataset.qid!, li]));
    const moving = blockIds.map((id) => rows().get(id)).filter((x): x is HTMLElement => !!x);
    const y0 = e.clientY, s0 = scroller.scrollTop;
    let y = y0, started = false, raf = 0, last = 0, cur: Drop | null = null;

    const pick = () => {
      const lis = rows();
      // jatuh sebelum blok sejajar pertama yang titik tengahnya di bawah pointer; kalau ga ada → sesudah yang terakhir
      let d: Drop | null = null;
      for (const s of sibs) {
        const a = lis.get(s.id)?.getBoundingClientRect(), b = lis.get(s.lastId)?.getBoundingClientRect();
        if (!a || !b) continue;
        if (y < (a.top + b.bottom) / 2) {
          d = { id: s.id, place: "before" };
          break;
        }
      }
      if (!d && sibs.length) d = { id: sibs[sibs.length - 1].id, place: "after" };
      // posisi sama kayak sekarang → bukan pindah
      if (d) {
        const prev = sibs.filter((s) => s.k < i).at(-1), next = sibs.find((s) => s.k > i);
        if ((d.place === "before" && next?.id === d.id) || (d.place === "after" && prev?.id === d.id)) d = null;
      }
      if (d?.id !== cur?.id || d?.place !== cur?.place) {
        cur = d;
        setDrop(d);
      }
    };
    const paint = () => {
      const dy = y - y0 + (scroller.scrollTop - s0);
      moving.forEach((li) => (li.style.transform = `translateY(${dy}px)`));
    };
    // auto-scroll dekat tepi; kecepatan per waktu (bukan per frame) biar sama di layar 60 / 120 Hz
    const loop = (now: number) => {
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      const r = scroller === document.scrollingElement ? { top: 0, bottom: innerHeight } : scroller.getBoundingClientRect();
      const edge = 56, v = y < r.top + edge ? -(r.top + edge - y) / 4 : y > r.bottom - edge ? (y - (r.bottom - edge)) / 4 : 0;
      if (v) {
        scroller.scrollTop += (Math.max(-18, Math.min(18, v)) * dt) / 16;
        paint();
        pick();
      }
      raf = requestAnimationFrame(loop);
    };
    const move = (ev: PointerEvent) => {
      y = ev.clientY;
      if (!started) {
        if (Math.abs(y - y0) < 4) return;
        started = true;
        setDragId(q.id);
        moving.forEach((li) => li.classList.add("dragging"));
        raf = requestAnimationFrame(loop);
      }
      paint();
      pick();
    };
    const end = (ev: PointerEvent) => {
      cleanup();
      if (started && ev.type === "pointerup" && cur) void commit(q, cur);
    };
    const cleanup = () => {
      cancelAnimationFrame(raf);
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", end);
      grip.removeEventListener("pointercancel", end);
      moving.forEach((li) => {
        li.classList.remove("dragging");
        li.style.transform = "";
      });
      setDragId(null);
      setDrop(null);
      stop.current = null;
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", end);
    grip.addEventListener("pointercancel", end);
    stop.current = cleanup;
  };

  // garis jatuh: di atas blok tujuan ("before") atau di bawah anak terakhirnya ("after")
  const lineAt = (() => {
    if (!drop) return null;
    const t = shown.findIndex((q) => q.id === drop.id);
    if (t < 0) return null;
    return drop.place === "before" ? { id: drop.id, cls: " drop-before" } : { id: shown[blockEndIdx(shown, t) - 1].id, cls: " drop-after" };
  })();

  const gripFor = (q: T): ReactNode =>
    enabled ? (
      <span className="q-grip" title="Geser buat ubah urutan" aria-hidden="true" onPointerDown={(e) => start(e, q)}>
        {GRIP}
      </span>
    ) : null;

  return { ulRef, shown, gripFor, dragging: dragId !== null, lineAt };
}

function Rows<T extends QuestRow>({ quests: data, idPrefix, isDone, onToggle, manage, readOnly, readOnlyTitle, fallbackFocus, reorder }: ListProps<T>) {
  const canDrag = !!reorder && !readOnly && data.length > 1;
  const { ulRef, shown: quests, gripFor, dragging, lineAt } = useQuestDrag(data, canDrag);
  return (
    <ul className={"tasks" + (canDrag ? " can-drag" : "") + (dragging ? " is-dragging" : "")} ref={ulRef}>
      {quests.map((q, i) =>
        manage && !readOnly ? (
          <ManagedRow
            key={q.id}
            grip={gripFor(q)}
            lineCls={lineAt?.id === q.id ? lineAt.cls : ""}
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
            grip={gripFor(q)}
            lineCls={lineAt?.id === q.id ? lineAt.cls : ""}
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
  grip,
  lineCls,
  q,
  done,
  idPrefix,
  onToggle,
  first,
  last,
  hasSub,
  fallbackFocus,
}: {
  grip?: ReactNode;
  lineCls?: string;
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
    <li className={"task has-act" + (done ? " done" : "") + (enter ? " enter" : "") + (lineCls ?? "")} data-qid={q.id} style={q.depth ? { paddingLeft: q.depth * 18 } : undefined}>
      {grip}
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
