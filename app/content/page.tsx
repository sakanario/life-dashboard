import Link from "next/link";
import { Suspense } from "react";
import { ArcChip, Loading, RO_TITLE } from "@/components/ui";
import { getContent } from "@/lib/vault/views";

const STAGES = [
  ["idea", "Ide"],
  ["script", "Script"],
  ["storyboard", "Storyboard"],
  ["shotlist", "Shot list"],
  ["rekaman", "Rekaman"],
  ["edit", "Edit"],
  ["upload", "Upload"],
  ["review", "Review 48 jam"],
  ["done", "Done"],
] as const;

async function Board() {
  const items = await getContent();
  const known = new Set<string>(STAGES.map((s) => s[0]));
  const odd = items.filter((c) => !known.has(c.stage));
  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">Content/</div>
          <h1>Pipeline konten</h1>
          <p className="muted">
            Seret kartu buat pindah tahap (nyusul di Fase 4). Ngikutin{" "}
            <Link className="wl" style={{ color: "var(--accent-text)" }} href={`/notes?path=${encodeURIComponent("Content/Pipeline Short Video.md")}`}>
              [[Pipeline Short Video]]
            </Link>
            .
          </p>
        </div>
        <button className="btn primary" type="button" disabled title={RO_TITLE}>
          + Ide cepat
        </button>
      </div>
      {odd.length ? (
        <div className="alert" role="note">
          <div>
            <b>{odd.length} konten punya stage yang ga dikenal:</b> {odd.map((c) => `${c.file} (${c.stage})`).join(", ")}
          </div>
        </div>
      ) : null}
      <div className="board-wrap">
        <div className="board">
          {STAGES.map(([k, l]) => {
            const cs = items.filter((c) => c.stage === k);
            return (
              <section key={k} className="lane" aria-label={l}>
                <div className="lane-h">
                  <b>{l}</b>
                  <span className="n">{cs.length}</span>
                </div>
                {cs.map((c) => (
                  <Link key={c.slug} className="card" href={`/notes?path=${encodeURIComponent(c.file)}`} style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}>
                    <b>{c.title}</b>
                    {c.snip ? <p>{c.snip}</p> : null}
                    {c.projectInfo ? (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <span className={"chip " + (c.projectInfo.isArchived ? "" : c.projectInfo.type ?? "")}>{c.projectInfo.title}</span>
                        <ArcChip show={c.projectInfo.isArchived} />
                      </div>
                    ) : null}
                    <span className="src">{c.file}</span>
                  </Link>
                ))}
                {k === "idea" ? (
                  <button className="ghost-add" type="button" disabled title={RO_TITLE}>
                    + ide
                  </button>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <div className="view">
      <Suspense fallback={<Loading />}>
        <Board />
      </Suspense>
    </div>
  );
}
