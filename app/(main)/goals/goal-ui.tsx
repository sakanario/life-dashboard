"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { focusFirst } from "@/components/habits";
import { AddQuestForm, useQuestToggle } from "@/components/quest";
import { QuestList } from "@/components/quest-manage";
import { toast } from "@/components/toast";
import { ArcChip, Bar } from "@/components/ui";
import { api } from "@/lib/client-api";
import { fmtDate } from "@/lib/vault/dates";
import type { getGoals } from "@/lib/vault/views";

type G = Awaited<ReturnType<typeof getGoals>>[number];

const fmtNum = (n: number) => (Number.isInteger(n) ? n.toLocaleString("id-ID") : n.toLocaleString("id-ID", { maximumFractionDigits: 2 }));

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
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

/** Kartu goal: status bisa diganti, milestone (quest di file goal) bisa dicentang / ditambah / diatur. */
export function GoalCard({ g }: { g: G }) {
  const m = g.metric;
  const { busy, run } = useRun();
  const { isDone, toggle } = useQuestToggle();
  const [status, setStatus] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const shown = status ?? g.status;
  const open = g.milestones.filter((q) => !isDone(q)).length;

  return (
    <article className={"panel goal" + (shown === "active" ? "" : " goal-off")}>
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
      </div>
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
    </article>
  );
}

/** Header halaman Goals + form goal baru. */
export function GoalsHead() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [horizon, setHorizon] = useState("medium");
  const [target, setTarget] = useState("");
  const [desc, setDesc] = useState("");
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
        <button className="btn" type="button" id="newgoal-btn" aria-expanded={open} aria-controls="newgoal" onClick={() => setOpen(!open)}>
          + Goal
        </button>
      </div>
      {open ? (
        <section className="panel" id="newgoal" aria-labelledby="newgoal-h">
          <form
            className="jform"
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              void run(
                () => api.createGoal({ title, horizon, target: target || null, desc }),
                (r) => {
                  toast("Goal dibuat", r.file);
                  setTitle("");
                  setDesc("");
                  setTarget("");
                  close();
                },
              );
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
          >
            <div className="panel-h" style={{ marginBottom: 0 }}>
              <h2 id="newgoal-h">Goal baru</h2>
              <span className="src">Goals/&lt;slug&gt;.md</span>
            </div>
            <div className="jfield">
              <label htmlFor="ng-title">Judul</label>
              <input type="text" id="ng-title" value={title} maxLength={200} autoFocus autoComplete="off" placeholder="Mau jadi / punya apa?" onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="np-row">
              <div className="jfield">
                <label htmlFor="ng-hz">Horizon</label>
                <select id="ng-hz" className="sel" value={horizon} onChange={(e) => setHorizon(e.target.value)}>
                  <option value="vision">vision (jangka panjang)</option>
                  <option value="medium">medium (1–2 tahun)</option>
                  <option value="year">year (tahun ini)</option>
                  <option value="quarter">quarter (kuartal ini)</option>
                </select>
              </div>
              <div className="jfield">
                <label htmlFor="ng-target">Target (opsional)</label>
                <input type="date" id="ng-target" className="date-in" value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>
            </div>
            <div className="jfield">
              <label htmlFor="ng-desc">Kenapa / deskripsi</label>
              <textarea id="ng-desc" rows={2} value={desc} placeholder="Boleh kosong" onChange={(e) => setDesc(e.target.value)} style={{ minHeight: "4em" }} />
            </div>
            <div className="jfoot" style={{ justifyContent: "flex-end" }}>
              <button className="btn" type="button" onClick={close}>
                Batal
              </button>
              <button className="btn primary" type="submit" disabled={busy || !title.trim()}>
                {busy ? "Bikin…" : "Bikin goal"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}
