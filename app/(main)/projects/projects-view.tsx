"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { NavIcon } from "@/components/icons";
import { focusFirst } from "@/components/habits";
import { AddQuestForm, useQuestToggle } from "@/components/quest";
import { QuestList } from "@/components/quest-manage";
import { useFresh, useLeaving } from "@/components/motion";
import { SlideSeg } from "@/components/slide-seg";
import { toast, toastError } from "@/components/toast";
import { Bar } from "@/components/ui";
import { api } from "@/lib/client-api";
import type { getProjectsPage } from "@/lib/vault/views";

type P = Awaited<ReturnType<typeof getProjectsPage>>[number];
type Filter = "all" | "personal" | "work" | "archived";
type GoalOpt = { slug: string; title: string };

const STATUSES = ["idea", "active", "paused", "done"] as const;
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
  // state null: biar ikut ke-sync ke router Next (kalau ngoper history.state, router.refresh balikin URL lama)
  history.replaceState(null, "", u);
}

/** Aksi tulis kecil: panggil API, toast error, refresh data server. */
function useWrite() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  async function run<R>(fn: () => Promise<R>, after?: (r: R) => void, { refresh = true } = {}) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fn();
      after?.(r);
      if (refresh) startTransition(() => router.refresh());
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

export function ProjectsView({
  projects,
  goals,
  initialFilter,
  initialOpen,
}: {
  projects: P[];
  goals: GoalOpt[];
  initialFilter: Filter;
  initialOpen: string | null;
}) {
  const [f, setF] = useState<Filter>(initialFilter);
  const [openSlug, setOpenSlug] = useState<string | null>(initialOpen);
  const [creating, setCreating] = useState(false);
  // navigasi ke ?p= / ?f= lain (palette, Hari ini) → ikutin. Bukan remount, biar state drawer ga ilang tiap refresh
  const [prev, setPrev] = useState({ f: initialFilter, p: initialOpen });
  if (prev.f !== initialFilter || prev.p !== initialOpen) {
    setPrev({ f: initialFilter, p: initialOpen });
    setF(initialFilter);
    setOpenSlug(initialOpen);
  }
  const { run } = useWrite();

  const arch = projects.filter((p) => p.isArchived);
  const list = projects.filter((p) => !p.isArchived && (f === "all" || (!p.isUncat && p.type === f)));
  const opened = projects.find((p) => p.slug === openSlug) ?? null;

  const [leaving, leave] = useLeaving<P>();

  const setFilter = (x: Filter) => { setF(x); syncUrl(x, openSlug); };
  const open = (s: string | null) => {
    leave(s ? null : opened);
    setOpenSlug(s);
    syncUrl(f, s);
  };
  // proyek yang dibuka barusan ilang (arsip/hapus): tutup lewat router.replace, bukan replaceState + refresh.
  // Kalau halaman dibuka dari ?p=, refresh tepat sesudah replaceState bikin Next 16 reload satu halaman → toast Urungkan ilang
  const router = useRouter();
  const [, startNav] = useTransition();
  const closeGone = () => {
    leave(opened);
    setOpenSlug(null);
    const u = new URL(location.href);
    u.searchParams.delete("p");
    startNav(() => router.replace(u.pathname + u.search, { scroll: false }));
  };

  const restore = (p: P) =>
    run(
      () => api.restoreProject(p.slug),
      (r) => toast("Proyek dipulihkan (paused)", `${r.from} → ${r.to}`),
    );

  const archive = (p: P) =>
    run(
      () => api.archiveProject(p.slug),
      (r) => {
        closeGone();
        // tanpa Urungkan: proyek diarsip bisa dipulihkan dari daftar Arsip
        toast("Proyek diarsip", `${r.from} → ${r.to}`);
      },
      { refresh: false },
    );

  const remove = (p: P) =>
    run(
      () => api.deleteProject(p.slug),
      (r) => {
        closeGone();
        toast("Proyek dihapus", `${r.from} → ${r.to}`, {
          label: "Urungkan",
          fn: () => void run(() => api.undeleteProject(p.slug, r.to, r.from), (x) => toast("Hapus dibatalin", `${x.from} → ${x.to}`)),
        });
      },
      { refresh: false },
    );

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">{f === "archived" ? "Archive/Projects/" : "Projects/"}</div>
          <h1>{f === "archived" ? "Proyek diarsip" : "Proyek"}</h1>
        </div>
        <div className="toolbar">
          <SlideSeg
            label="Filter proyek"
            value={f}
            onChange={setFilter}
            options={[
              ["all", "Semua"],
              ["personal", "Personal"],
              ["work", "Work"],
              ["archived", `Arsip (${arch.length})`],
            ]}
          />
          <button className="btn" type="button" id="newproj-btn" aria-expanded={creating} aria-controls="newproj" onClick={() => setCreating(!creating)}>
            + Proyek
          </button>
        </div>
      </div>

      {creating ? (
        <NewProject
          goals={goals}
          defaultType={f === "work" ? "work" : "personal"}
          onCancel={() => {
            setCreating(false);
            focusFirst(["newproj-btn"]);
          }}
          onCreated={(slug) => {
            setCreating(false);
            if (f === "archived") setFilter("all");
            open(slug);
          }}
        />
      ) : null}

      {f === "archived" ? (
        <section className="panel proj-swap" key={f} aria-label="Daftar proyek diarsip">
          {arch.length ? (
            <ul className="arc-list">
              {arch.map((p, i) => (
                <li key={p.slug} style={{ "--i": i } as React.CSSProperties}>
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
                  <button className="btn sm" type="button" onClick={() => void restore(p)}>
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
        // key = filter: ganti tab → grid dipasang ulang, kartu muncul berurutan lagi
        <div className="proj-grid" key={f}>
          {list.map((p, i) => (
            <article
              key={p.slug}
              style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
              className="panel proj"
              tabIndex={0}
              role="button"
              onClick={() => open(p.slug)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(p.slug); } }}
            >
              {p.isUncat ? null : (
                <div className="proj-top">
                  <span className={"chip " + p.type}>{p.type}</span>
                  <span className={"status st-" + p.status}>{p.status}</span>
                </div>
              )}
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
                {p.isUncat ? <span className="src">{p.file}</span> : <span className="muted mono">update {fmtDate(p.updated)}</span>}
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
          {list.length ? null : <p className="muted proj-swap">Ga ada proyek di filter ini.</p>}
        </div>
      )}

      {opened ? (
        <Drawer key={opened.slug} p={opened} onClose={() => open(null)} onArchive={() => archive(opened)} onRestore={() => restore(opened)} onDelete={() => remove(opened)} />
      ) : leaving ? (
        <Drawer key={leaving.slug} p={leaving} leaving onClose={() => {}} onArchive={() => {}} onRestore={() => {}} onDelete={() => {}} />
      ) : null}
    </>
  );
}

function NewProject({
  goals,
  defaultType,
  onCancel,
  onCreated,
}: {
  goals: GoalOpt[];
  defaultType: "personal" | "work";
  onCancel: () => void;
  onCreated: (slug: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"personal" | "work">(defaultType);
  const [status, setStatus] = useState("active");
  const [goal, setGoal] = useState("");
  const [desc, setDesc] = useState("");
  const { busy, run } = useWrite();

  return (
    <section className="panel" id="newproj" aria-labelledby="newproj-h">
      <form
        className="jform"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          void run(
            () => api.createProject({ title, type, status, goal: goal || null, desc }),
            (r) => {
              toast("Proyek dibuat", r.file);
              onCreated(r.slug);
            },
          );
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      >
        <div className="panel-h" style={{ marginBottom: 0 }}>
          <h2 id="newproj-h">Proyek baru</h2>
          <span className="src">Projects/&lt;slug&gt;/README.md</span>
        </div>
        <div className="jfield">
          <label htmlFor="np-title">Judul</label>
          <input type="text" id="np-title" value={title} maxLength={120} autoFocus autoComplete="off" placeholder="Nama proyek" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="np-row">
          <div className="jfield">
            <label id="np-type">Type</label>
            <div className="seg" role="group" aria-labelledby="np-type">
              {(["personal", "work"] as const).map((t) => (
                <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="jfield">
            <label htmlFor="np-status">Status</label>
            <select id="np-status" className="sel" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="jfield">
            <label htmlFor="np-goal">Goal</label>
            <select id="np-goal" className="sel" value={goal} onChange={(e) => setGoal(e.target.value)}>
              <option value="">—</option>
              {goals.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="jfield">
          <label htmlFor="np-desc">Ringkasan</label>
          <textarea id="np-desc" rows={2} value={desc} placeholder="1–3 kalimat (boleh kosong)" onChange={(e) => setDesc(e.target.value)} style={{ minHeight: "4em" }} />
        </div>
        <div className="jfoot" style={{ justifyContent: "flex-end" }}>
          <button className="btn" type="button" onClick={onCancel}>
            Batal
          </button>
          <button className="btn primary" type="submit" disabled={busy || !title.trim()}>
            {busy ? "Bikin…" : "Bikin proyek"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Drawer({
  p,
  leaving = false,
  onClose,
  onArchive,
  onRestore,
  onDelete,
}: {
  p: P;
  leaving?: boolean;
  onClose: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<"tasks" | "notes">("tasks");
  const [manage, setManage] = useState(false);
  const [ask, setAsk] = useState<"archive" | "delete" | null>(null);
  const { isDone, toggle } = useQuestToggle();
  const { busy, run } = useWrite();
  const [status, setStatus] = useState<string | null>(null); // optimistis sampai data server baru datang
  // isi drawer muncul berurutan cuma pas baru dibuka (bukan tiap ganti tab di dalamnya)
  const fresh = useFresh();
  useEffect(() => {
    if (leaving) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose, leaving]);

  const arc = p.isArchived;
  const shownStatus = status ?? p.status;
  return (
    <div className={"scrim slide-scrim" + (leaving ? " leaving" : "")} inert={leaving} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={"drawer" + (fresh ? " fresh" : "")} role="dialog" aria-modal="true" aria-label={p.title + (arc ? " (diarsip)" : "")}>
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
            <button className="btn sm" type="button" onClick={onRestore}>
              Pulihkan
            </button>
          </div>
        ) : null}
        {p.isUncat ? null : (
          <dl className="fm">
            <dt>type</dt>
            <dd>
              <span className={"chip " + p.type}>{p.type}</span>
            </dd>
            <dt>
              <label htmlFor="pstatus">status</label>
            </dt>
            <dd>
              {arc ? (
                <span className="chip arc">archived</span>
              ) : (
                <select
                  id="pstatus"
                  className={"sel status-sel st-" + shownStatus}
                  value={shownStatus}
                  disabled={busy}
                  onChange={(e) => {
                    const s = e.target.value;
                    setStatus(s);
                    void run(
                      () => api.setProjectStatus(p.slug, s),
                      (r) => toast("Status jadi " + r.status, r.file + " · status"),
                    ).finally(() => setStatus(null));
                  }}
                >
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
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
        )}
        {p.desc ? <p style={{ margin: 0 }}>{p.desc}</p> : null}
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "tasks"} onClick={() => setTab("tasks")}>
            Quest ({p.stats.open} terbuka)
          </button>
          {p.isUncat ? null : (
            <button type="button" role="tab" aria-selected={tab === "notes"} onClick={() => setTab("notes")}>
              Catatan ({p.files.length})
            </button>
          )}
          {tab === "tasks" && !arc && p.quests.length ? (
            <button
              type="button"
              className="btn sm manage-tog"
              id="dmanage"
              aria-pressed={manage}
              title="Ubah urutan, edit teks, atau hapus quest"
              onClick={() => setManage(!manage)}
            >
              {manage ? "Selesai atur" : "Atur"}
            </button>
          ) : null}
        </div>
        {tab === "tasks" ? (
          <>
            {p.quests.length ? (
              <QuestList
                quests={p.quests}
                idPrefix="dtk-"
                isDone={isDone}
                onToggle={toggle}
                manage={manage}
                readOnly={arc}
                readOnlyTitle="Proyek diarsip (read-only)"
                fallbackFocus="ptext"
              />
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: ".86rem" }}>
                Belum ada quest.
              </p>
            )}
            {arc ? null : <AddQuestForm inputId="ptext" project={p.isUncat ? undefined : p.slug} />}
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
        {p.isUncat ? null : (
          <div className="drawer-foot">
            <div className="row">
              {arc ? null : (
                <button
                  className="btn sm danger"
                  type="button"
                  id="darchive"
                  aria-expanded={ask === "archive"}
                  aria-controls="dconfirm"
                  onClick={() => {
                    setAsk("archive");
                    focusFirst(["dyes"]);
                  }}
                >
                  Arsipkan
                </button>
              )}
              <button
                className="btn sm danger"
                type="button"
                id="ddelete"
                aria-expanded={ask === "delete"}
                aria-controls="dconfirm"
                onClick={() => {
                  setAsk("delete");
                  focusFirst(["dyes"]);
                }}
              >
                Hapus
              </button>
            </div>
            {ask ? (
              <div className="confirm pop-in" key={ask} id="dconfirm" role="group" aria-labelledby="dconfmsg">
                {ask === "archive" ? (
                  <p id="dconfmsg">
                    Arsipkan <b>{p.title}</b>? Folder dipindah ke <span className="mono">Archive/Projects/{p.slug}/</span>.{" "}
                    {p.stats.open ? `${p.stats.open} quest terbuka ikut diarsip dan ga muncul di Hari ini lagi.` : "Ga ada quest terbuka."}
                  </p>
                ) : (
                  <p id="dconfmsg">
                    Hapus <b>{p.title}</b>? Proyek ilang dari daftar (termasuk arsip) beserta {p.stats.total} quest dan {p.files.length} catatannya. Foldernya
                    ga dihapus permanen, cuma dipindah ke <span className="mono">Archive/Deleted/Projects/</span>.
                  </p>
                )}
                <div className="row">
                  <button className="btn sm danger" type="button" id="dyes" onClick={ask === "archive" ? onArchive : onDelete}>
                    {ask === "archive" ? "Ya, arsipkan" : "Ya, hapus"}
                  </button>
                  <button
                    className="btn sm"
                    type="button"
                    onClick={() => {
                      focusFirst([ask === "archive" ? "darchive" : "ddelete"]);
                      setAsk(null);
                    }}
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </aside>
    </div>
  );
}
