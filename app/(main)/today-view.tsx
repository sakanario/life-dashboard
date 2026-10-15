"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { focusFirst, HabitRow, useHabitSetter, type HabitState } from "@/components/habits";
import { JournalForm } from "@/components/journal-form";
import { AddQuestForm, QuestItem, useQuestToggle } from "@/components/quest";
import { Bar } from "@/components/ui";
import { useWatchEp } from "@/components/watch-ep";
import type { getToday } from "@/lib/vault/views";

type Data = Awaited<ReturnType<typeof getToday>>;
type Kind = "all" | "personal" | "work";
type Q = Data["open"][number];

/** Grup tempat quest tampil di panel Quest. */
const groupKey = (q: Q) => (q.source === "uncat" ? "uncat" : q.source === "goal" ? "goal:" + q.goal : (q.project ?? "uncat"));

/** Habis centang / batal: fokus ke quest tetangga di grup yang sama, kalau ga ada ke ringkasan grup. */
function focusPlan(el: HTMLElement, q: Q, wasDone: boolean) {
  if (wasDone) return ["tk-" + q.id, "tgs-" + groupKey(q), "tdone-sum"];
  const g = el.closest<HTMLElement>(".tgroup");
  if (!g) return ["tk-" + q.id, "tdone-sum"];
  const cs = [...g.querySelectorAll<HTMLElement>(".check")], i = cs.indexOf(el);
  const sib = [g.nextElementSibling, g.previousElementSibling].filter((x): x is HTMLElement => !!x?.matches(".tgroup"));
  return [cs[i + 1]?.id, cs[i - 1]?.id, "tgs-" + g.dataset.tg, ...sib.map((x) => "tgs-" + x.dataset.tg), "tdone-sum"];
}

const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const longDate = (s: string) => {
  const [, m, d] = s.split("-").map(Number);
  return d + " " + BULAN_PANJANG[m - 1];
};

const IC_COLLAPSE = <path d="m7 20 5-5 5 5M7 4l5 5 5-5" />;
const IC_EXPAND = <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />;

/* status buka/tutup tiap grup quest, diinget per browser */
const TG_KEY = "ld-tg-closed";
const subscribeTg = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(TG_KEY, cb);
  return () => { window.removeEventListener("storage", cb); window.removeEventListener(TG_KEY, cb); };
};
const tgSnapshot = () => { try { return localStorage.getItem(TG_KEY) || "{}"; } catch { return "{}"; } };

export function TodayView({ data, greeting, hour, journalOpen: jOpen0 }: { data: Data; greeting: string; hour: number; journalOpen: boolean }) {
  const [filter, setFilter] = useState<Kind>("all");
  const closedRaw = useSyncExternalStore(subscribeTg, tgSnapshot, () => "{}");
  const closed = useMemo<Record<string, boolean>>(() => { try { return JSON.parse(closedRaw); } catch { return {}; } }, [closedRaw]);
  const [journalOpen, setJournalOpen] = useState(jOpen0);
  const [doneOpen, setDoneOpen] = useState(false);
  const ep = useWatchEp();
  const { isDone, toggle } = useQuestToggle();
  const habit = useHabitSetter(data.today);

  const saveClosed = (next: Record<string, boolean>) => {
    try { localStorage.setItem(TG_KEY, JSON.stringify(next)); } catch {}
    window.dispatchEvent(new Event(TG_KEY));
  };

  const inF = (k: "personal" | "work") => filter === "all" || k === filter;
  // status optimistis: quest yang baru dicentang langsung pindah ke "Selesai hari ini"
  const live = [...data.open, ...data.doneToday].filter((q) => inF(q.kind));
  const open = live.filter((q) => !isDone(q));
  const doneTd = live.filter((q) => isDone(q));
  const onToggle = (q: Q, el: HTMLElement) => {
    const ids = focusPlan(el, q, isDone(q));
    toggle(q);
    focusFirst(ids);
  };
  const groups = data.groups
    .map((g) => ({
      ...g,
      qs: open.filter((q) =>
        g.key === "uncat" ? q.source === "uncat" : g.key.startsWith("goal:") ? q.source === "goal" && "goal:" + q.goal === g.key : q.project === g.key,
      ),
    }))
    .filter((g) => g.qs.length);
  const anyOpen = groups.some((g) => !closed[g.key]);

  const j = data.journal;
  const habits = data.habits.map((h) => ({ ...h, state: habit.stateOf(h.id, h.state) as HabitState }));
  const habitsTot = habits.length;
  const hDone = habits.filter((h) => h.state === "done").length;
  const hMissed = habits.filter((h) => h.state === "missed").length;
  const habitsOpen = habitsTot - hDone - hMissed;

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">
            {HARI[data.weekday]}, {longDate(data.today)} {data.today.slice(0, 4)}
          </div>
          <h1>{greeting}</h1>
          <p className="muted">
            Highlight hari ini: <b style={{ color: "var(--ink)" }}>{j?.highlight || "belum diisi"}</b>
          </p>
        </div>
      </div>

      {data.gap ? (
        <div className="alert" role="note">
          <div>
            <b>Jurnal bolong {data.gap.days} hari.</b> Terakhir nulis {longDate(data.gap.last)}
            {data.gap.hasToday ? ", terus lanjut lagi hari ini." : "."}
          </div>
          <Link className="btn sm" href="/journal">
            Lihat heatmap
          </Link>
        </div>
      ) : null}

      <div className="grid g-today">
        <div className="col">
          <section className={"panel jpanel" + (journalOpen ? " open" : "")}>
            <div className="panel-h jhead">
              <h2>
                <button type="button" className="jtoggle" aria-expanded={journalOpen} aria-controls="jbody" onClick={() => setJournalOpen(!journalOpen)}>
                  <svg className="jchev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                  <span className="jt-title">Jurnal hari ini</span>
                  <span className="jstat">
                    {!j?.summary ? (
                      <>
                        <span>Belum ditulis</span>
                        {hour >= 18 ? <span className="chip work">waktunya nulis</span> : null}
                      </>
                    ) : (
                      <>
                        {j.highlight ? (
                          <>
                            <span className="jhl">{j.highlight}</span>
                            <span className="jmeta" aria-hidden="true">·</span>
                          </>
                        ) : null}
                        <span className="jmeta">
                          {j.words} kata · disimpan {j.savedAt}
                        </span>
                      </>
                    )}
                  </span>
                </button>
              </h2>
              <span className="src">{data.journalFile}</span>
            </div>
            <div id="jbody" hidden={!journalOpen}>
              <JournalForm
                date={data.today}
                highlight={j?.highlight ?? ""}
                summary={j?.summary ?? ""}
                savedAt={j?.savedAt ?? null}
                questsDone={j?.questsDone ?? []}
              />
            </div>
          </section>

          <section className="panel" aria-labelledby="tp-h" id="quest">
            <div className="panel-h task-head">
              <h2 id="tp-h">Quest</h2>
              <span className="muted tnum" style={{ fontSize: ".82rem" }}>
                {open.length} terbuka
              </span>
              {groups.length > 1 ? (
                <button
                  className="btn sm tg-all"
                  type="button"
                  aria-label={anyOpen ? "Tutup semua" : "Buka semua"}
                  onClick={() => {
                    const next = { ...closed };
                    groups.forEach((g) => (next[g.key] = anyOpen));
                    saveClosed(next);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {anyOpen ? IC_COLLAPSE : IC_EXPAND}
                  </svg>
                  {anyOpen ? "Tutup semua" : "Buka semua"}
                </button>
              ) : null}
              <div className="seg" role="group" aria-label="Filter quest">
                {(
                  [
                    ["all", "Semua"],
                    ["personal", "Personal"],
                    ["work", "Work"],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {groups.length ? (
              <div className="tgroups">
                {groups.map((g) => (
                  <details
                    key={g.key}
                    className="tgroup"
                    data-tg={g.key}
                    open={!closed[g.key]}
                    onToggle={(e) => {
                      const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                      if (isOpen === !closed[g.key]) return;
                      saveClosed({ ...closed, [g.key]: !isOpen });
                    }}
                  >
                    <summary id={"tgs-" + g.key} aria-label={`${g.title}, ${g.qs.length} terbuka`}>
                      {g.title}
                      {g.type ? <span className={"chip " + g.type}>{g.type}</span> : null}
                      <span className="n">{g.qs.length}</span>
                    </summary>
                    <ul className="tasks">
                      {g.qs.map((q) => (
                        <QuestItem key={q.id} q={q} done={false} onToggle={onToggle} idPrefix="tk-" />
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            ) : (
              <p className="muted task-empty">Ga ada quest terbuka{filter === "all" ? "" : " di filter ini"}. Mantap.</p>
            )}
            <AddQuestForm
              inputId="ttext"
              options={data.projectOptions}
              onAdded={(p) => {
                // grup tujuan dibuka biar quest barunya keliatan
                const key = p ?? "uncat";
                if (closed[key]) saveClosed({ ...closed, [key]: false });
              }}
            />
            <details className="tdone" open={doneOpen} onToggle={(e) => setDoneOpen((e.currentTarget as HTMLDetailsElement).open)}>
              <summary id="tdone-sum">Selesai hari ini ({doneTd.length})</summary>
              {doneTd.length ? (
                <ul className="tasks">
                  {doneTd.map((q) => (
                    <QuestItem key={q.id} q={q} done onToggle={onToggle} idPrefix="tk-" />
                  ))}
                </ul>
              ) : (
                <p className="muted task-empty">Belum ada yang dicentang hari ini.</p>
              )}
            </details>
          </section>
        </div>

        <div className="col">
          <section className="panel">
            <div className="panel-h">
              <h2>Habit</h2>
              <span className="src">frontmatter: habits</span>
            </div>
            <div className="ring-row">
              <Ring done={hDone} missed={hMissed} total={habitsTot} />
              <div className="muted" style={{ fontSize: ".86rem" }} aria-live="polite">
                {habitsTot === 0
                  ? "Belum ada habit di Habits.md."
                  : habitsOpen === 0
                    ? "Hari ini beres." + (hMissed ? ` ${hMissed} terlewat, besok lagi.` : "")
                    : `${habitsOpen} lagi buat hari ini` + (hMissed ? ` · ${hMissed} terlewat` : "")}
              </div>
            </div>
            <div className="habits">
              {habits.map((h) => (
                <HabitRow
                  key={h.id}
                  id={h.id}
                  label={h.label}
                  state={h.state}
                  streak={h.state === "done" ? h.base + 1 : h.state === "missed" ? 0 : h.base}
                  onSet={(want) => habit.set(h.id, h.label, data.habits.find((x) => x.id === h.id)!.state, want)}
                />
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-h">
              <h2>Proyek aktif</h2>
              <Link className="btn sm" href="/projects" style={{ marginLeft: "auto" }}>
                Semua
              </Link>
            </div>
            {data.activeProjects.map((p) => (
              <div key={p.slug} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "7px 0" }}>
                <div className="stat-row">
                  <Link className="btn sm" href={`/projects?p=${p.slug}`} style={{ border: 0, padding: 0, background: "none", fontWeight: 600 }}>
                    {p.title}
                  </Link>
                  <span className="mono muted">{Math.round(p.progress * 100)}%</span>
                </div>
                <Bar value={p.progress} good={p.type === "personal"} />
              </div>
            ))}
          </section>

          <section className="panel">
            <div className="panel-h">
              <h2>Lagi ditonton</h2>
              <Link className="btn sm" href="/watchlist" style={{ marginLeft: "auto" }}>
                Watchlist
              </Link>
            </div>
            {data.watching.length ? (
              data.watching.map((w) => (
                <div key={w.slug} className="stat-row" style={{ padding: "6px 0" }}>
                  <span>{w.title}</span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="mono tnum">
                      ep {ep.progressOf(w)}
                      {w.total ? "/" + w.total : ""}
                    </span>
                    <button className="btn sm" type="button" aria-label={`+1 episode ${w.title}`} onClick={() => void ep.plusOne(w)}>
                      +1
                    </button>
                  </span>
                </div>
              ))
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: ".86rem" }}>
                Lagi ga nonton apa-apa.
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Ring({ done, missed, total }: { done: number; missed: number; total: number }) {
  const r = 22, c = 2 * Math.PI * r, t = total || 1, dl = (c * done) / t, ml = (c * missed) / t;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--sunk)" strokeWidth="6" />
      {missed ? <circle cx="28" cy="28" r={r} fill="none" stroke="var(--muted)" strokeOpacity=".4" strokeWidth="6" strokeDasharray={`${ml} ${c}`} strokeDashoffset={-dl} transform="rotate(-90 28 28)" /> : null}
      {done ? <circle cx="28" cy="28" r={r} fill="none" stroke="var(--good)" strokeWidth="6" strokeDasharray={`${dl} ${c}`} transform="rotate(-90 28 28)" /> : null}
      <text x="28" y="33" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--ink)" fontFamily="var(--f-display)">
        {done}/{total}
      </text>
    </svg>
  );
}
