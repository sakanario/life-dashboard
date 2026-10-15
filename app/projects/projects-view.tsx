"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NavIcon } from "@/components/icons";
import { QuestItem } from "@/components/quest";
import { Bar, RO_TITLE } from "@/components/ui";
import type { getProjects } from "@/lib/vault/views";

type P = Awaited<ReturnType<typeof getProjects>>[number];
type Filter = "all" | "personal" | "work" | "archived";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const fmtDate = (s: string | null) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const [, m, d] = s.split("-").map(Number);
  return d + " " + BULAN[m - 1];
};

/** Simpan filter & proyek yang dibuka di URL tanpa ngerender ulang server. */
function syncUrl(f: Filter, p: string | null) {
  const u = new URL(location.href);
  if (f === "all") u.searchParams.delete("f");
  else u.searchParams.set("f", f);
  if (p) u.searchParams.set("p", p);
  else u.searchParams.delete("p");
  history.replaceState(history.state, "", u);
}

export function ProjectsView({ projects, initialFilter, initialOpen }: { projects: P[]; initialFilter: Filter; initialOpen: string | null }) {
  const [f, setF] = useState<Filter>(initialFilter);
  const [openSlug, setOpenSlug] = useState<string | null>(initialOpen);
  const arch = projects.filter((p) => p.isArchived);
  const list = projects.filter((p) => !p.isArchived && (f === "all" || p.type === f));
  const opened = projects.find((p) => p.slug === openSlug) ?? null;

  const setFilter = (x: Filter) => { setF(x); syncUrl(x, openSlug); };
  const open = (s: string | null) => { setOpenSlug(s); syncUrl(f, s); };

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">{f === "archived" ? "Archive/Projects/" : "Projects/"}</div>
          <h1>{f === "archived" ? "Proyek diarsip" : "Proyek"}</h1>
        </div>
        <div className="toolbar">
          <div className="seg" role="group" aria-label="Filter proyek">
            {(
              [
                ["all", "Semua"],
                ["personal", "Personal"],
                ["work", "Work"],
                ["archived", `Arsip (${arch.length})`],
              ] as [Filter, string][]
            ).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={f === k} onClick={() => setFilter(k)}>
                {l}
              </button>
            ))}
          </div>
          <button className="btn" type="button" disabled title={RO_TITLE}>
            + Proyek
          </button>
        </div>
      </div>

      {f === "archived" ? (
        <section className="panel" aria-label="Daftar proyek diarsip">
          {arch.length ? (
            <ul className="arc-list">
              {arch.map((p) => (
                <li key={p.slug}>
                  <div className="arc-main">
                    <button type="button" className="arc-title" onClick={() => open(p.slug)}>
                      {p.title}
                    </button>
                    <div className="arc-meta">
                      <span className={"chip " + p.type}>{p.type}</span>
                      <span className="muted">diarsip {fmtDate(p.archived)}</span>
                      <span className="muted mono">
                        {p.stats.done}/{p.stats.total} quest
                      </span>
                      <span className="src">{p.dir}/</span>
                    </div>
                  </div>
                  <button className="btn sm" type="button" disabled title={RO_TITLE}>
                    Pulihkan
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Belum ada proyek yang diarsip. Arsipin dari drawer proyek kalau udah ga dikerjain lagi, foldernya dipindah ke <span className="mono">Archive/Projects/</span>.
            </p>
          )}
        </section>
      ) : (
        <div className="proj-grid">
          {list.map((p) => (
            <article
              key={p.slug}
              className="panel proj"
              tabIndex={0}
              role="button"
              onClick={() => open(p.slug)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(p.slug); } }}
            >
              <div className="proj-top">
                <span className={"chip " + p.type}>{p.type}</span>
                <span className={"status st-" + p.status}>{p.status}</span>
              </div>
              <h2>{p.title}</h2>
              {p.desc ? (
                <p className="muted" style={{ margin: 0, fontSize: ".86rem" }}>
                  {p.desc}
                </p>
              ) : null}
              <div className="stat-row">
                <span className="muted mono">
                  {p.stats.done}/{p.stats.total} quest
                </span>
                <span className="muted mono">update {fmtDate(p.updated)}</span>
              </div>
              <Bar value={p.stats.progress} good={p.type === "personal"} />
              {p.next ? (
                <div className="next">
                  <span className="muted">Next:</span>
                  <span>{p.next}</span>
                </div>
              ) : (
                <div className="next muted">Belum ada quest terbuka</div>
              )}
            </article>
          ))}
          {list.length ? null : <p className="muted">Ga ada proyek di filter ini.</p>}
        </div>
      )}

      {opened ? <Drawer p={opened} onClose={() => open(null)} /> : null}
    </>
  );
}

function Drawer({ p, onClose }: { p: P; onClose: () => void }) {
  const [tab, setTab] = useState<"tasks" | "notes">("tasks");
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);

  const arc = p.isArchived;
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={p.title + (arc ? " (diarsip)" : "")}>
        <div className="drawer-h">
          <div>
            <div className="eyebrow">{p.file}</div>
            <h1 style={{ fontSize: "1.5rem" }}>{p.title}</h1>
          </div>
          <button className="btn sm x" type="button" aria-label="Tutup" onClick={onClose} autoFocus>
            ✕
          </button>
        </div>
        {arc ? (
          <div className="arc-banner" role="note">
            <span>Diarsip {fmtDate(p.archived)}. Read-only.</span>
            <button className="btn sm" type="button" disabled title={RO_TITLE}>
              Pulihkan
            </button>
          </div>
        ) : null}
        <dl className="fm">
          <dt>type</dt>
          <dd>
            <span className={"chip " + p.type}>{p.type}</span>
          </dd>
          <dt>status</dt>
          <dd>
            {arc ? (
              <span className="chip arc">archived</span>
            ) : (
              <span className={"status st-" + p.status} title={RO_TITLE}>
                {p.status}
              </span>
            )}
          </dd>
          <dt>goal</dt>
          <dd>{p.goal ? <Link className="mono" href="/goals">{p.goal}</Link> : <span className="muted">—</span>}</dd>
          <dt>tags</dt>
          <dd>
            {p.tags.length ? p.tags.map((t) => <span key={t} className="chip" style={{ marginRight: 4 }}>{t}</span>) : <span className="muted">—</span>}
          </dd>
          <dt>updated</dt>
          <dd className="mono">{p.updated ?? "—"}</dd>
        </dl>
        {p.desc ? <p style={{ margin: 0 }}>{p.desc}</p> : null}
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "tasks"} onClick={() => setTab("tasks")}>
            Quest ({p.stats.open} terbuka)
          </button>
          <button type="button" role="tab" aria-selected={tab === "notes"} onClick={() => setTab("notes")}>
            Catatan ({p.files.length})
          </button>
        </div>
        {tab === "tasks" ? (
          <>
            {p.quests.length ? (
              <ul className="tasks">
                {p.quests.map((q) => (
                  <QuestItem key={q.id} q={q} />
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: ".86rem" }}>
                Belum ada quest.
              </p>
            )}
            {arc ? null : (
              <form className="add-row" onSubmit={(e) => e.preventDefault()}>
                <input aria-label="Quest baru" placeholder="Quest baru…" autoComplete="off" disabled title={RO_TITLE} />
                <button className="btn" type="submit" disabled title={RO_TITLE}>
                  Tambah
                </button>
              </form>
            )}
          </>
        ) : (
          <ul className="file-list">
            {p.files.map((f) => (
              <li key={f}>
                <NavIcon name="notes" size={16} />
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{f}</span>
                <Link className="btn sm" style={{ marginLeft: "auto" }} href={`/notes?path=${encodeURIComponent(p.dir + "/" + f)}`}>
                  Buka
                </Link>
              </li>
            ))}
          </ul>
        )}
        {arc ? null : (
          <div className="drawer-foot">
            <button className="btn sm danger" type="button" disabled title={RO_TITLE}>
              Arsipkan
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
