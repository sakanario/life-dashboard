import Link from "next/link";
import { Suspense } from "react";
import { ArcChip, Bar, Loading, RO_TITLE } from "@/components/ui";
import { fmtDate } from "@/lib/vault/dates";
import { getGoals } from "@/lib/vault/views";

type G = Awaited<ReturnType<typeof getGoals>>[number];

const HORIZON = [
  { key: "vision", label: "Big vision", sub: "jangka panjang" },
  { key: "medium", label: "Medium goals", sub: "1–2 tahun" },
  { key: "year", label: "Tahun ini", sub: "" },
  { key: "quarter", label: "Kuartal ini", sub: "" },
] as const;

const fmtNum = (n: number) => (Number.isInteger(n) ? n.toLocaleString("id-ID") : n.toLocaleString("id-ID", { maximumFractionDigits: 2 }));

function GoalCard({ g }: { g: G }) {
  const m = g.metric;
  return (
    <article className="panel goal">
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="chip">{g.horizon}</span>
        {g.status !== "active" ? <span className={"status " + (g.status === "done" ? "st-done" : "st-idea")}>{g.status}</span> : null}
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
        {g.desc || (m ? "" : g.questTotal ? `${g.questDone}/${g.questTotal} quest selesai di proyek terkait.` : "Belum ada quest atau metric. Tambah field metric di frontmatter.")}
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
    </article>
  );
}

async function Goals() {
  const goals = await getGoals();
  const year = new Date().getFullYear();
  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">Goals/</div>
          <h1>Arah hidup</h1>
        </div>
        <button className="btn" type="button" disabled title={RO_TITLE}>
          + Goal
        </button>
      </div>
      <section className="panel">
        {HORIZON.map((h) => {
          const gs = goals.filter((g) => g.horizon === h.key);
          if (!gs.length) return null;
          const quarterSub = h.key === "quarter" ? gs.find((g) => g.target)?.target : null;
          return (
            <div key={h.key} className="horizon">
              <div className="horizon-label">
                <span className="eyebrow">{h.label}</span>
                <span className="muted" style={{ fontSize: ".82rem" }}>
                  {quarterSub ? `s/d ${fmtDate(quarterSub)} ${quarterSub.slice(0, 4)}` : h.key === "year" ? year : h.sub}
                </span>
              </div>
              {h.key === "vision" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {gs.map((g) => (
                    <p key={g.slug} className="vision" style={{ margin: 0 }}>
                      {g.desc || g.title}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="goal-cards">
                  {gs.map((g) => (
                    <GoalCard key={g.slug} g={g} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {goals.length ? null : <p className="muted" style={{ margin: 0 }}>Belum ada goal di Goals/.</p>}
      </section>
    </>
  );
}

export default function Page() {
  return (
    <div className="view">
      <Suspense fallback={<Loading />}>
        <Goals />
      </Suspense>
    </div>
  );
}
