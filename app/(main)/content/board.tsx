"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { focusFirst } from "@/components/habits";
import { toast } from "@/components/toast";
import { ArcChip } from "@/components/ui";
import { api } from "@/lib/client-api";
import { PLATFORMS, PUBLISHED_STAGES, STAGES, stageLabel } from "@/lib/vault/content-format";
import type { getContent } from "@/lib/vault/views";

type C = Awaited<ReturnType<typeof getContent>>[number];
type ProjOpt = { slug: string; title: string };

/** Simpan konten yang dibuka di URL (?c=slug). State null biar router Next ikut ke-sync. */
function syncUrl(c: string | null) {
  const u = new URL(location.href);
  u.searchParams.delete("ide");
  if (c) u.searchParams.set("c", c);
  else u.searchParams.delete("c");
  history.replaceState(null, "", u);
}

export function Board({
  items,
  projects,
  initialOpen,
  initialAdd,
  notice,
}: {
  notice?: ReactNode;
  items: C[];
  projects: ProjOpt[];
  initialOpen: string | null;
  initialAdd: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [over, setOver] = useState<Record<string, string>>({}); // stage optimistis
  const [dragSlug, setDragSlug] = useState<string | null>(null);
  const [overLane, setOverLane] = useState<string | null>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(initialOpen);
  const [adding, setAdding] = useState(initialAdd);
  // navigasi ke ?c= / ?ide=1 lain (palette) → ikutin tanpa remount
  const [prev, setPrev] = useState({ c: initialOpen, a: initialAdd });
  if (prev.c !== initialOpen || prev.a !== initialAdd) {
    setPrev({ c: initialOpen, a: initialAdd });
    if (initialOpen) setOpenSlug(initialOpen);
    if (initialAdd) setAdding(true);
  }

  const stageOf = (c: C) => over[c.slug] ?? c.stage;
  const opened = items.find((c) => c.slug === openSlug) ?? null;
  const open = (s: string | null) => {
    setOpenSlug(s);
    syncUrl(s);
  };

  async function move(c: C, stage: string, refocus = false) {
    if (stageOf(c) === stage) return;
    setOver((o) => ({ ...o, [c.slug]: stage }));
    if (refocus) focusFirst(["card-" + c.slug]);
    try {
      const r = await api.updateContent(c.slug, { stage });
      toast(`Pindah ke ${stageLabel(stage)}`, `${r.file} · stage: ${stage}${r.changed.includes("published") ? ` · published: ${r.published}` : ""}`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      startTransition(() => {
        router.refresh();
        setOver((o) => {
          const n = { ...o };
          delete n[c.slug];
          return n;
        });
      });
    }
  }

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">Content/</div>
          <h1>Pipeline konten</h1>
          <p className="muted">
            Seret kartu buat pindah tahap (keyboard: Alt + ← / →), atau buka kartunya. Ngikutin{" "}
            <Link className="wl" style={{ color: "var(--accent-text)" }} href={`/notes?path=${encodeURIComponent("Content/Pipeline Short Video.md")}`}>
              [[Pipeline Short Video]]
            </Link>
            .
          </p>
        </div>
        <button
          className="btn primary"
          type="button"
          onClick={() => {
            setAdding(true);
            focusFirst(["idea-in"]);
          }}
        >
          + Ide cepat
        </button>
      </div>
      {notice}
      <div className="board-wrap">
        <div className="board">
          {STAGES.map(([k, l], si) => {
            const cs = items.filter((c) => stageOf(c) === k);
            return (
              <section
                key={k}
                className={"lane" + (overLane === k && dragSlug ? " over" : "")}
                aria-label={l}
                onDragOver={(e) => {
                  if (!dragSlug) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (overLane !== k) setOverLane(k);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverLane((x) => (x === k ? null : x));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const c = items.find((x) => x.slug === dragSlug);
                  setDragSlug(null);
                  setOverLane(null);
                  if (c) void move(c, k);
                }}
              >
                <div className="lane-h">
                  <b>{l}</b>
                  <span className="n">{cs.length}</span>
                </div>
                {k === "idea" && adding ? <IdeaForm projects={projects} onClose={() => setAdding(false)} /> : null}
                {cs.map((c) => (
                  <article
                    key={c.slug}
                    id={"card-" + c.slug}
                    className={"card" + (dragSlug === c.slug ? " dragging" : "")}
                    draggable
                    tabIndex={0}
                    role="button"
                    aria-label={`${c.title}, tahap ${l}`}
                    aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
                    onDragStart={(e) => {
                      setDragSlug(c.slug);
                      e.dataTransfer.effectAllowed = "move";
                      try {
                        e.dataTransfer.setData("text/plain", c.slug);
                      } catch {}
                    }}
                    onDragEnd={() => {
                      setDragSlug(null);
                      setOverLane(null);
                    }}
                    onClick={() => open(c.slug)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open(c.slug);
                      } else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
                        e.preventDefault();
                        const to = STAGES[si + (e.key === "ArrowLeft" ? -1 : 1)];
                        if (to) void move(c, to[0], true);
                      }
                    }}
                  >
                    <b>{c.title}</b>
                    {c.snip ? <p>{c.snip}</p> : null}
                    {c.projectInfo || c.platform.length ? (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {c.projectInfo ? (
                          <>
                            <span className={"chip " + (c.projectInfo.isArchived ? "" : c.projectInfo.type ?? "")}>{c.projectInfo.title}</span>
                            <ArcChip show={c.projectInfo.isArchived} />
                          </>
                        ) : null}
                        {c.platform.map((p) => (
                          <span key={p} className="chip">
                            {p}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {c.stats?.views !== null && c.stats?.views !== undefined ? <span className="muted mono" style={{ fontSize: ".74rem" }}>{c.stats.views.toLocaleString("id-ID")} views</span> : null}
                    <span className="src">{c.file}</span>
                  </article>
                ))}
                {k === "idea" && !adding ? (
                  <button
                    className="ghost-add"
                    type="button"
                    onClick={() => {
                      setAdding(true);
                      focusFirst(["idea-in"]);
                    }}
                  >
                    + ide
                  </button>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
      {opened ? (
        <ContentDrawer
          key={opened.slug}
          c={opened}
          stage={stageOf(opened)}
          projects={projects}
          onMove={(s) => void move(opened, s)}
          onClose={() => {
            open(null);
            focusFirst(["card-" + opened.slug]);
          }}
        />
      ) : null}
    </>
  );
}

/** Form ide cepat di atas lane Ide. Tetap kebuka habis nyimpen biar bisa nulis beberapa ide berturut-turut. */
function IdeaForm({ projects, onClose }: { projects: ProjOpt[]; onClose: () => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="card idea-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t || busy) return;
        setBusy(true);
        try {
          const r = await api.createIdea(t, project || null);
          toast("Ide dibuat", r.file);
          setTitle("");
          startTransition(() => router.refresh());
        } catch (err) {
          toast((err as Error).message);
        } finally {
          setBusy(false);
          focusFirst(["idea-in"]);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <input
        id="idea-in"
        aria-label="Judul ide"
        placeholder="Ide 1 kalimat…"
        autoComplete="off"
        autoFocus
        maxLength={200}
        value={title}
        readOnly={busy}
        onChange={(e) => setTitle(e.target.value)}
      />
      <select className="sel" aria-label="Proyek (opsional)" value={project} onChange={(e) => setProject(e.target.value)}>
        <option value="">tanpa proyek</option>
        {projects.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.title}
          </option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn sm primary" type="submit" disabled={busy || !title.trim()}>
          {busy ? "Nyimpen…" : "Simpan"}
        </button>
        <button className="btn sm" type="button" onClick={onClose}>
          Tutup
        </button>
      </div>
    </form>
  );
}

function ContentDrawer({
  c,
  stage,
  projects,
  onMove,
  onClose,
}: {
  c: C;
  stage: string;
  projects: ProjOpt[];
  onMove: (stage: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState<string[] | null>(null); // optimistis
  const [stats, setStats] = useState(() => ({
    views: c.stats?.views?.toString() ?? "",
    comments: c.stats?.comments?.toString() ?? "",
    retention: c.stats?.retention ?? "",
  }));
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);

  async function save(patch: Parameters<typeof api.updateContent>[1], msg: string) {
    setBusy(true);
    try {
      const r = await api.updateContent(c.slug, patch);
      toast(msg, `${r.file} · ${r.changed.join(", ")}`);
      startTransition(() => {
        router.refresh();
        setPlatform(null);
      });
    } catch (e) {
      toast((e as Error).message);
      setPlatform(null);
    } finally {
      setBusy(false);
    }
  }

  const plats = platform ?? c.platform;
  const extraPlats = c.platform.filter((p) => !(PLATFORMS as readonly string[]).includes(p));
  const showStats = PUBLISHED_STAGES.includes(stage) || !!c.stats;
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[.,\s]/g, "")));

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={c.title}>
        <div className="drawer-h">
          <div>
            <div className="eyebrow">{c.file}</div>
            <h1 style={{ fontSize: "1.5rem" }}>{c.title}</h1>
          </div>
          <button className="btn sm x" type="button" aria-label="Tutup" onClick={onClose} autoFocus>
            ✕
          </button>
        </div>
        <dl className="fm">
          <dt>
            <label htmlFor="cstage">stage</label>
          </dt>
          <dd>
            <select id="cstage" className="sel" value={stage} onChange={(e) => onMove(e.target.value)}>
              {STAGES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </dd>
          <dt id="cplat">platform</dt>
          <dd>
            <div className="chip-tog" role="group" aria-labelledby="cplat">
              {[...PLATFORMS, ...extraPlats].map((p) => {
                const on = plats.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    className="chip"
                    aria-pressed={on}
                    disabled={busy}
                    onClick={() => {
                      const next = on ? plats.filter((x) => x !== p) : [...plats, p];
                      setPlatform(next);
                      void save({ platform: next }, on ? `Platform ${p} dihapus` : `Platform ${p} ditambah`);
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </dd>
          <dt>
            <label htmlFor="cproj">project</label>
          </dt>
          <dd>
            <select
              id="cproj"
              className="sel"
              value={c.project ?? ""}
              disabled={busy}
              onChange={(e) => void save({ project: e.target.value || null }, e.target.value ? "Proyek diganti" : "Proyek dilepas")}
            >
              <option value="">—</option>
              {c.project && !projects.some((p) => p.slug === c.project) ? <option value={c.project}>{c.projectInfo?.title ?? c.project} (arsip)</option> : null}
              {projects.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.title}
                </option>
              ))}
            </select>
          </dd>
          <dt>
            <label htmlFor="cpub">published</label>
          </dt>
          <dd>
            <input
              id="cpub"
              type="date"
              className="date-in"
              defaultValue={c.published ?? ""}
              key={c.published ?? ""}
              disabled={busy}
              onBlur={(e) => {
                const val = e.target.value || null;
                if (val !== (c.published ?? null)) void save({ published: val }, val ? "Tanggal tayang disimpan" : "Tanggal tayang dihapus");
              }}
            />
          </dd>
        </dl>

        {showStats ? (
          <form
            className="jform panel-sub"
            onSubmit={(e) => {
              e.preventDefault();
              const v = num(stats.views), cm = num(stats.comments);
              if ((v !== null && !Number.isFinite(v)) || (cm !== null && !Number.isFinite(cm))) return toast("Views & komen harus angka");
              void save({ stats: { views: v, comments: cm, retention: stats.retention.trim() || null } }, "Stats disimpan");
            }}
          >
            <div className="panel-h" style={{ marginBottom: 0 }}>
              <h2 style={{ fontSize: "1rem" }}>Review 48 jam</h2>
              <span className="src">frontmatter: stats</span>
            </div>
            <div className="np-row">
              <div className="jfield">
                <label htmlFor="cs-views">Views</label>
                <input type="text" inputMode="numeric" id="cs-views" value={stats.views} onChange={(e) => setStats({ ...stats, views: e.target.value })} placeholder="1200" />
              </div>
              <div className="jfield">
                <label htmlFor="cs-com">Komen</label>
                <input type="text" inputMode="numeric" id="cs-com" value={stats.comments} onChange={(e) => setStats({ ...stats, comments: e.target.value })} placeholder="12" />
              </div>
              <div className="jfield" style={{ flex: 1, minWidth: 160 }}>
                <label htmlFor="cs-ret">Retention</label>
                <input type="text" id="cs-ret" value={stats.retention} onChange={(e) => setStats({ ...stats, retention: e.target.value })} placeholder="40% @3s" />
              </div>
            </div>
            <div className="jfoot" style={{ justifyContent: "flex-end" }}>
              <button className="btn primary" type="submit" disabled={busy}>
                Simpan stats
              </button>
            </div>
          </form>
        ) : null}

        <div className="jfield">
          <label>Script / catatan</label>
          {c.snip ? <p style={{ margin: 0, fontSize: ".9rem", whiteSpace: "pre-wrap" }}>{c.snip}{c.snip.length >= 180 ? "…" : ""}</p> : <p className="muted" style={{ margin: 0 }}>Masih kosong.</p>}
          <Link className="btn sm" style={{ alignSelf: "flex-start", marginTop: 6 }} href={`/notes?path=${encodeURIComponent(c.file)}&edit=1`}>
            Edit script / catatan
          </Link>
        </div>
      </aside>
    </div>
  );
}
