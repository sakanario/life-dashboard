"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { focusFirst } from "./habits";
import { api, type ToggleResult } from "@/lib/client-api";
import { toast } from "./toast";
import { ArcChip } from "./ui";

export type QuestRow = {
  id: string;
  file: string;
  line: number;
  text: string;
  done: boolean;
  tags: string[];
  depth: number;
  raw?: string;
};

/**
 * Centang quest secara optimistis. Klik beruntun di quest yang sama dikirim berurutan,
 * dan cuma posisi terakhir yang penting (REQUIREMENTS §5.1).
 */
export function useQuestToggle() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [over, setOver] = useState<Record<string, boolean>>({});
  const jobs = useRef(new Map<string, { want: boolean; running: boolean; q: QuestRow }>());

  const isDone = useCallback((q: QuestRow) => over[q.id] ?? q.done, [over]);

  const run = useCallback(
    async (key: string) => {
      const j = jobs.current.get(key)!;
      j.running = true;
      let id = j.q.id, server = j.q.done, res: ToggleResult | null = null;
      try {
        while (j.want !== server) {
          const want = j.want;
          res = await api.toggleQuest(id, j.q.text, want);
          id = res.id;
          server = want;
        }
        if (res) {
          const where = `${res.file}:${res.line}`;
          if (res.done) toast(res.journal.action === "added" ? "Quest selesai, dicatat di jurnal" : "Quest selesai", where);
          else if (res.journal.action === "not-found" && res.journal.file)
            toast("Quest dibuka lagi. Baris di jurnal ga dihapus (udah diedit / ga ada)", res.journal.file);
          else toast("Quest dibuka lagi", where);
        }
      } catch (e) {
        toast((e as Error).message);
      } finally {
        jobs.current.delete(key);
        // data server baru + buang status optimistis dalam satu transisi biar ga kedip
        startTransition(() => {
          router.refresh();
          setOver((o) => {
            const n = { ...o };
            delete n[key];
            return n;
          });
        });
      }
    },
    [router],
  );

  const toggle = useCallback(
    (q: QuestRow) => {
      const want = !(over[q.id] ?? q.done);
      setOver((o) => ({ ...o, [q.id]: want }));
      const j = jobs.current.get(q.id);
      if (j) j.want = want;
      else jobs.current.set(q.id, { want, running: false, q });
      if (!jobs.current.get(q.id)!.running) void run(q.id);
    },
    [over, run],
  );

  return { isDone, toggle };
}

export function QuestItem<T extends QuestRow>({
  q,
  done = q.done,
  onToggle,
  readOnly,
  readOnlyTitle,
  idPrefix,
  project,
}: {
  q: T;
  done?: boolean;
  onToggle?: (q: T, el: HTMLButtonElement) => void;
  readOnly?: boolean;
  readOnlyTitle?: string;
  idPrefix?: string;
  project?: { title: string; type: string | null; isArchived: boolean } | null;
}) {
  return (
    <li className={"task" + (done ? " done" : "")} style={q.depth ? { paddingLeft: q.depth * 18 } : undefined}>
      <button
        className="check"
        type="button"
        id={idPrefix ? idPrefix + q.id : undefined}
        disabled={readOnly || !onToggle}
        title={readOnly ? readOnlyTitle : undefined}
        aria-pressed={done}
        aria-label={(done ? "Batal selesai: " : "Tandai selesai: ") + q.text}
        onClick={(e) => onToggle?.(q, e.currentTarget)}
      />
      <div>
        <div className="t-text">{q.text}</div>
        <div className="t-meta">
          {project ? (
            <>
              <span className={"chip " + (project.isArchived ? "" : project.type ?? "")}>{project.title}</span>
              <ArcChip show={project.isArchived} />
            </>
          ) : null}
          {q.tags.map((t) => (
            <span key={t} className="chip">
              @{t}
            </span>
          ))}
          <span className="src">
            {q.file}:{q.line}
          </span>
        </div>
      </div>
    </li>
  );
}

/**
 * Form tambah quest. `project` diisi = selalu ke README proyek itu (drawer);
 * kalau `options` diisi, ada pilihan tujuan (Hari ini, default Uncategorize).
 */
export function AddQuestForm({
  inputId,
  project,
  goal,
  options,
  onAdded,
}: {
  inputId: string;
  project?: string;
  goal?: string;
  options?: { slug: string; title: string }[];
  onAdded?: (project: string | null) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [dest, setDest] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    const target = project ?? (goal ? null : dest || null);
    setBusy(true);
    try {
      const r = await api.addQuest(t, { project: target, goal: goal ?? null });
      toast("Quest ditambah", `${r.file}:${r.line}`);
      setText("");
      onAdded?.(target);
      startTransition(() => router.refresh());
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      focusFirst([inputId]);
    }
  }

  return (
    <form
      className="add-row"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        id={inputId}
        aria-label="Quest baru"
        placeholder={options ? "Quest baru… (@tag boleh)" : "Quest baru…"}
        autoComplete="off"
        value={text}
        readOnly={busy}
        maxLength={500}
        onChange={(e) => setText(e.target.value)}
      />
      {options ? (
        <select aria-label="Simpan ke" value={dest} onChange={(e) => setDest(e.target.value)}>
          <option value="">Uncategorize</option>
          {options.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.title}
            </option>
          ))}
        </select>
      ) : null}
      <button className="btn" type="submit" disabled={busy || !text.trim()}>
        {busy ? "Nambah…" : "Tambah"}
      </button>
    </form>
  );
}
