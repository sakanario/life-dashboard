import Link from "next/link";
import { Suspense } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loading } from "@/components/ui";
import { getNotes, type TreeNode } from "@/lib/vault/notes";
import { NoteDoc } from "./note-editor";

const href = (p: string) => `/notes?path=${encodeURIComponent(p)}`;

function Tree({ nodes, sel }: { nodes: TreeNode[]; sel: string | null }) {
  return (
    <>
      {nodes.map((n) =>
        n.dir ? (
          <details key={n.path} open={!!sel && sel.startsWith(n.path + "/")}>
            <summary>{n.name}</summary>
            <Tree nodes={n.children ?? []} sel={sel} />
          </details>
        ) : (
          <Link key={n.path} className={"f" + (n.path === sel ? " on" : "")} href={href(n.path)} aria-current={n.path === sel ? "page" : undefined}>
            {n.name}
          </Link>
        ),
      )}
    </>
  );
}

async function Notes({ searchParams }: { searchParams: PageProps<"/notes">["searchParams"] }) {
  const sp = await searchParams;
  const sel = typeof sp.path === "string" ? sp.path : null;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const edit = sp.edit === "1";
  const { tree, doc, results } = await getNotes(sel, q || null);

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">semua file .md</div>
          <h1>Catatan</h1>
        </div>
        <form action="/notes" role="search" style={{ maxWidth: 320, width: "100%" }}>
          <input className="search-btn" style={{ color: "var(--ink)" }} name="q" defaultValue={q} placeholder="Cari di seluruh vault…" aria-label="Cari catatan" />
        </form>
      </div>
      <div className="notes">
        <nav className="panel tree" aria-label="File vault">
          <Tree nodes={tree} sel={sel} />
          <div className="locked">🔒 _private/ (disembunyikan)</div>
        </nav>
        <article className="panel doc">
          {results ? (
            <>
              <div className="panel-h">
                <h2>Hasil cari “{q}”</h2>
                <span className="src">{results.length} file</span>
              </div>
              {results.length ? (
                <ul className="sresults">
                  {results.map((r) => (
                    <li key={r.path}>
                      <Link href={href(r.path)}>
                        <span className="src">
                          {r.path}:{r.line}
                        </span>
                        <span style={{ fontSize: ".88rem" }}>{r.snippet}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Ga ketemu.</p>
              )}
            </>
          ) : doc ? (
            doc.kind === "md" ? (
              <NoteDoc key={doc.path} path={doc.path} initialEdit={edit}>

                  {doc.fm && Object.keys(doc.fm).length ? (
                    <dl className="fm">
                      {Object.entries(doc.fm).map(([k, v]) => (
                        <FmRow key={k} k={k} v={v} />
                      ))}
                    </dl>
                  ) : null}
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href: h, children }) => {
                        const u = h ?? "";
                        if (u === "#missing") return <a className="wl missing" title="Catatan tidak ketemu">{children}</a>;
                        if (u.startsWith("/notes")) return <Link className="wl" href={u.replace(/#wl$/, "")}>{children}</Link>;
                        if (u.startsWith("/api/assets")) return <a className="wl" href={u} target="_blank" rel="noreferrer">{children}</a>;
                        return <a href={u} target="_blank" rel="noreferrer noopener">{children}</a>;
                      },
                      // eslint-disable-next-line @next/next/no-img-element -- gambar dari vault lewat /api/assets
                      img: ({ src, alt }) => <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} loading="lazy" />,
                      table: ({ children }) => (
                        <div className="table-wrap">
                          <table>{children}</table>
                        </div>
                      ),
                    }}
                  >
                    {doc.md ?? ""}
                  </ReactMarkdown>
              </NoteDoc>
            ) : (
              <>
                <div className="panel-h" style={{ marginBottom: 4 }}>
                  <span className="src">{doc.path}</span>
                </div>
                {doc.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- gambar dari vault lewat /api/assets
                <img className="doc-img" src={`/api/assets?path=${encodeURIComponent(doc.path)}`} alt={doc.path} />
                ) : (
                  <p className="muted">File ini aset (bukan teks atau gambar), cuma ditampilin di file tree.</p>
                )}
              </>
            )
          ) : sel ? (
            <p className="muted">File <span className="mono">{sel}</span> ga ketemu (atau ada di folder yang disembunyikan).</p>
          ) : (
            <>
              <h1>Pilih catatan</h1>
              <p className="muted">Buka file dari pohon di kiri, cari pakai kotak di atas, atau tekan <span className="kbd">Ctrl K</span>.</p>
            </>
          )}
        </article>
      </div>
    </>
  );
}

function FmRow({ k, v }: { k: string; v: unknown }) {
  const text = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return (
    <>
      <dt>{k}</dt>
      <dd className={typeof v === "object" ? "mono" : undefined} style={{ overflowWrap: "anywhere" }}>
        {text || <span className="muted">—</span>}
      </dd>
    </>
  );
}

export default function Page({ searchParams }: PageProps<"/notes">) {
  return (
    <div className="view">
      <Suspense fallback={<Loading />}>
        <Notes searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
