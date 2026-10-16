"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { focusFirst } from "@/components/habits";
import { AddQuestForm, useQuestToggle } from "@/components/quest";
import { QuestList } from "@/components/quest-manage";
import { toast, toastInfo, toastError } from "@/components/toast";
import { ArcChip, Bar } from "@/components/ui";
import { api } from "@/lib/client-api";
import { fmtDate } from "@/lib/vault/dates";
import type { getGoals } from "@/lib/vault/views";

type G = Awaited<ReturnType<typeof getGoals>>[number];
type GoalVals = { title: string; horizon: string; target: string; desc: string };

const fmtNum = (n: number) => (Number.isInteger(n) ? n.toLocaleString("id-ID") : n.toLocaleString("id-ID", { maximumFractionDigits: 2 }));

const HORIZON_OPTS = [
  ["vision", "vision (jangka panjang)"],
  ["medium", "medium (1–2 tahun)"],
  ["year", "year (tahun ini)"],
  ["quarter", "quarter (kuartal ini)"],
] as const;

function useRun() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  async function run<R>(fn: () => Promise<R>, after?: (r: R) => void) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fn();
      after?.(r);
      startTransition(() => router.refresh());
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

/* goal yang barusan dibuat / dipulihkan / pindah horizon: dapet animasi masuk waktu pertama muncul */
const justAdded = new Set<string>();
function markAdded(slug: string) {
  justAdded.add(slug);
  setTimeout(() => justAdded.delete(slug), 4000);
}
function useJustAdded(slug: string) {
  const [on] = useState(() => justAdded.has(slug));
  return on;
}

/** Hapus goal (file ke Archive/Goals/) + toast "Urungkan". */
function useDeleteGoal(g: G) {
  const { busy, run } = useRun();
  const del = () =>
    run(
      () => api.deleteGoal(g.slug),
      (r) =>
        toast("Goal dihapus", `${r.from} → ${r.to}`, {
          label: "Urungkan",
          fn: () =>
            void run(
              () => api.restoreGoal(g.slug, r.to),
              (x) => {
                markAdded(g.slug);
                toast("Goal dipulihkan", x.to);
              },
            ),
        }),
    );
  return { busy, del };
}

const IC_EDIT = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
  </svg>
);
const IC_TRASH = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

/** Tombol ikon Edit + Hapus di pojok kartu / item vision. */
function GoalActions({ g, onEdit, onDelete }: { g: G; onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="goal-acts">
      <button type="button" className="icon-btn" id={`ge-${g.slug}`} aria-label={"Edit goal: " + g.title} title="Edit" onClick={onEdit}>
        {IC_EDIT}
      </button>
      <button type="button" className="icon-btn danger" id={`gd-${g.slug}`} aria-label={"Hapus goal: " + g.title} title="Hapus" onClick={onDelete}>
        {IC_TRASH}
      </button>
    </span>
  );
}

/** Konfirmasi hapus goal. */
function ConfirmDelete({ g, busy, onYes, onNo }: { g: G; busy: boolean; onYes: () => void; onNo: () => void }) {
  const linked = g.links.length;
  return (
    <div className="confirm goal-pop" role="group" aria-labelledby={`gdmsg-${g.slug}`}>
      <p id={`gdmsg-${g.slug}`}>
        Hapus <b>{g.title}</b>? File dipindah ke <span className="mono">Archive/Goals/</span>, masih bisa diurungkan.
        {linked ? ` ${linked} proyek yang nyambung tetap ada, cuma ga kelihatan di sini lagi.` : ""}
        {g.milestones.length ? ` ${g.milestones.length} milestone ikut pindah.` : ""}
      </p>
      <div className="row">
        <button className="btn sm danger" type="button" id={`gdyes-${g.slug}`} disabled={busy} onClick={onYes}>
          {busy ? "Hapus…" : "Ya, hapus"}
        </button>
        <button className="btn sm" type="button" onClick={onNo}>
          Batal
        </button>
      </div>
    </div>
  );
}

/** Form goal: dipakai buat bikin baru dan edit. */
function GoalForm({
  idp,
  heading,
  src,
  init,
  submitLabel,
  busyLabel,
  busy,
  compact,
  onSubmit,
  onCancel,
}: {
  idp: string;
  heading: string;
  src?: string;
  init: GoalVals;
  submitLabel: string;
  busyLabel: string;
  busy: boolean;
  compact?: boolean;
  onSubmit: (v: GoalVals, reset: () => void) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(init);
  const set = (k: keyof GoalVals) => (e: { target: { value: string } }) => setV((o) => ({ ...o, [k]: e.target.value }));
  return (
    <form
      className="jform"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.title.trim()) return;
        onSubmit(v, () => setV(init));
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="panel-h" style={{ marginBottom: 0 }}>
        <h2 id={`${idp}-h`} style={compact ? { fontSize: "1rem" } : undefined}>
          {heading}
        </h2>
        {src ? <span className="src">{src}</span> : null}
      </div>
      <div className="jfield">
        <label htmlFor={`${idp}-title`}>Judul</label>
        <input type="text" id={`${idp}-title`} value={v.title} maxLength={200} autoComplete="off" placeholder="Mau jadi / punya apa?" onChange={set("title")} />
      </div>
      <div className="np-row">
        <div className="jfield">
          <label htmlFor={`${idp}-hz`}>Horizon</label>
          <select id={`${idp}-hz`} className="sel" value={v.horizon} onChange={set("horizon")}>
            {HORIZON_OPTS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="jfield">
          <label htmlFor={`${idp}-target`}>Target (opsional)</label>
          <input type="date" id={`${idp}-target`} className="date-in" value={v.target} onChange={set("target")} />
        </div>
      </div>
      <div className="jfield">
        <label htmlFor={`${idp}-desc`}>Kenapa / deskripsi</label>
        <textarea id={`${idp}-desc`} rows={2} value={v.desc} placeholder="Boleh kosong" onChange={set("desc")} style={{ minHeight: "4em" }} />
      </div>
      <div className="jfoot" style={{ justifyContent: "flex-end" }}>
        <button className="btn" type="button" onClick={onCancel}>
          Batal
        </button>
        <button className="btn primary" type="submit" disabled={busy || !v.title.trim()}>
          {busy ? busyLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Edit goal di tempat (kartu / item vision). */
function EditGoal({ g, onDone }: { g: G; onDone: (saved: boolean) => void }) {
  const { busy, run } = useRun();
  return (
    <div className="goal-pop">
      <GoalForm
        idp={`eg-${g.slug}`}
        heading="Edit goal"
        src={g.file}
        compact
        init={{ title: g.title, horizon: g.horizon, target: g.target ?? "", desc: g.descRaw }}
        submitLabel="Simpan"
        busyLabel="Simpan…"
        busy={busy}
        onCancel={() => onDone(false)}
        onSubmit={(v) =>
          void run(
            () => api.updateGoal(g.slug, { title: v.title, horizon: v.horizon, target: v.target || null, desc: v.desc }),
            (r) => {
              // pindah horizon = kartu muncul di seksi lain → kasih animasi masuk di sana
              if (r.changed.includes("horizon")) markAdded(g.slug);
              (r.changed.length ? toast : toastInfo)(r.changed.length ? "Goal disimpan" : "Ga ada yang berubah", r.changed.length ? `${r.file} · ${r.changed.join(", ")}` : r.file);
              onDone(true);
            },
          )
        }
      />
    </div>
  );
}

/** Mode kartu: lihat, edit, atau konfirmasi hapus. Fokus balik ke tombol asal waktu batal. */
function useGoalMode(g: G) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const { busy: delBusy, del } = useDeleteGoal(g);
  return {
    mode,
    delBusy,
    edit: () => {
      setMode("edit");
      focusFirst([`eg-${g.slug}-title`], 400);
    },
    ask: () => {
      setMode("confirm");
      focusFirst([`gdyes-${g.slug}`], 400);
    },
    back: (from: "edit" | "confirm") => {
      setMode("view");
      focusFirst([from === "edit" ? `ge-${g.slug}` : `gd-${g.slug}`], 400);
    },
    del: () => void del(),
  };
}

/** Item big vision: paragraf + edit / hapus. */
export function VisionItem({ g, i }: { g: G; i: number }) {
  const enter = useJustAdded(g.slug);
  const m = useGoalMode(g);
  return (
    <div className={"vision-item" + (enter ? " enter" : "")} style={{ "--j": i } as React.CSSProperties}>
      {m.mode === "edit" ? (
        <EditGoal g={g} onDone={() => m.back("edit")} />
      ) : (
        <>
          <div className="vision-row">
            <p className="vision" style={{ margin: 0 }}>
              {g.desc || g.title}
            </p>
            <GoalActions g={g} onEdit={m.edit} onDelete={m.ask} />
          </div>
          {m.mode === "confirm" ? <ConfirmDelete g={g} busy={m.delBusy} onYes={m.del} onNo={() => m.back("confirm")} /> : null}
        </>
      )}
    </div>
  );
}

/** Kartu goal: status bisa diganti, milestone (quest di file goal) bisa dicentang / ditambah / diatur, goal bisa diedit / dihapus. */
export function GoalCard({ g, i }: { g: G; i: number }) {
  const m = g.metric;
  const { busy, run } = useRun();
  const { isDone, toggle } = useQuestToggle();
  const [status, setStatus] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const enter = useJustAdded(g.slug);
  const gm = useGoalMode(g);
  const shown = status ?? g.status;
  const open = g.milestones.filter((q) => !isDone(q)).length;

  return (
    <article className={"panel goal" + (shown === "active" ? "" : " goal-off") + (enter ? " enter" : "")} style={{ "--j": i } as React.CSSProperties}>
      {gm.mode === "edit" ? (
        <EditGoal g={g} onDone={() => gm.back("edit")} />
      ) : (
        <>
          <div className="goal-head">
            <span className="chip">{g.horizon}</span>
            <select
              className={"sel status-sel " + (shown === "done" ? "st-done" : shown === "dropped" ? "st-idea" : "st-active")}
              aria-label={"Status goal: " + g.title}
              value={shown}
              disabled={busy}
              onChange={(e) => {
                const s = e.target.value;
                setStatus(s);
                void run(
                  () => api.setGoalStatus(g.slug, s),
                  (r) => toast("Status goal jadi " + r.status, r.file + " · status"),
                ).finally(() => setStatus(null));
              }}
            >
              <option value="active">active</option>
              <option value="done">done</option>
              <option value="dropped">dropped</option>
            </select>
            <Link className="src" style={{ marginLeft: "auto", textDecoration: "none" }} href={`/notes?path=${encodeURIComponent(g.file)}`}>
              {g.file}
            </Link>
            <GoalActions g={g} onEdit={gm.edit} onDelete={gm.ask} />
          </div>
          {gm.mode === "confirm" ? <ConfirmDelete g={g} busy={gm.delBusy} onYes={gm.del} onNo={() => gm.back("confirm")} /> : null}
          <h3>{g.title}</h3>
          {m && m.current !== null ? (
            <div className="stat-row">
              <b className="tnum">{fmtNum(m.current)}</b>
              <span className="muted" style={{ fontSize: ".82rem" }}>
                {m.target !== null ? `/ ${fmtNum(m.target)} ` : ""}
                {m.label}
              </span>
            </div>
          ) : null}
          <Bar value={g.progress} good />
          <div className="muted" style={{ fontSize: ".82rem" }}>
            {g.desc || (m ? "" : g.questTotal ? `${g.questDone}/${g.questTotal} quest selesai.` : "Belum ada quest atau metric. Tambah milestone di bawah, atau field metric di frontmatter.")}
            {g.target ? <span className="mono"> · target {fmtDate(g.target)} {g.target.slice(0, 4)}</span> : null}
          </div>
          {g.links.length ? (
            <div className="links">
              {g.links.map((p) => (
                <span key={p.slug} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                  <Link className={"chip " + (p.isArchived ? "" : p.type)} href={`/projects?p=${p.slug}`} style={{ textDecoration: "none" }}>
                    {p.title}
                  </Link>
                  <ArcChip show={p.isArchived} />
                </span>
              ))}
            </div>
          ) : null}
          <div className="goal-qs">
            <div className="goal-head">
              <span className="eyebrow">
                Milestone{g.milestones.length ? ` · ${open} terbuka` : ""}
              </span>
              {g.milestones.length ? (
                <button type="button" className="btn sm manage-tog" style={{ marginLeft: "auto" }} aria-pressed={manage} onClick={() => setManage(!manage)}>
                  {manage ? "Selesai atur" : "Atur"}
                </button>
              ) : null}
            </div>
            {g.milestones.length ? (
              <QuestList
                quests={g.milestones}
                idPrefix={`g-${g.slug}-`}
                isDone={isDone}
                onToggle={toggle}
                manage={manage}
                fallbackFocus={`gq-${g.slug}`}
              />
            ) : null}
            <AddQuestForm inputId={`gq-${g.slug}`} goal={g.slug} />
          </div>
        </>
      )}
    </article>
  );
}

/** Header halaman Goals + form goal baru (buka/tutup beranimasi). */
export function GoalsHead() {
  const [open, setOpen] = useState(false);
  const { busy, run } = useRun();
  const close = () => {
    setOpen(false);
    focusFirst(["newgoal-btn"]);
  };

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">Goals/</div>
          <h1>Arah hidup</h1>
        </div>
        <button
          className="btn"
          type="button"
          id="newgoal-btn"
          aria-expanded={open}
          aria-controls="newgoal"
          onClick={() => {
            setOpen(!open);
            if (!open) focusFirst(["ng-title"], 400);
          }}
        >
          + Goal
        </button>
      </div>
      {/* selalu dirender biar tinggi bisa dianimasiin; inert waktu tertutup */}
      <div className={"reveal" + (open ? " open" : "")} inert={!open}>
        <div className="reveal-in">
          <section className="panel" id="newgoal" aria-labelledby="ng-h">
            <GoalForm
              idp="ng"
              heading="Goal baru"
              src="Goals/<slug>.md"
              init={{ title: "", horizon: "medium", target: "", desc: "" }}
              submitLabel="Bikin goal"
              busyLabel="Bikin…"
              busy={busy}
              onCancel={close}
              onSubmit={(v, reset) =>
                void run(
                  () => api.createGoal({ title: v.title, horizon: v.horizon, target: v.target || null, desc: v.desc }),
                  (r) => {
                    markAdded(r.slug);
                    toast("Goal dibuat", r.file);
                    reset();
                    close();
                  },
                )
              }
            />
          </section>
        </div>
      </div>
    </>
  );
}
