import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { BULAN, fmtDate, fromIso } from "@/lib/vault/dates";
import { plain } from "@/lib/vault/parse";
import { getJournalPage } from "@/lib/vault/views";
import { JournalDays } from "./editor";
import type { TimelineRow } from "./timeline";

async function Journal() {
  const d = await getJournalPage();
  const s = d.stats;

  // label bulan di atas heatmap: satu kolom per minggu
  const weeks: number[] = [];
  d.cells.forEach((c, i) => i % 7 === 0 && weeks.push(fromIso(c.date).getMonth()));

  const rows: TimelineRow[] = d.rows.map((r) =>
    r.kind === "gap"
      ? r
      : { kind: "day", date: r.entry.date, file: r.entry.file, highlight: r.entry.highlight, summary: summaryText(r.entry.summary), tags: r.entry.tags, questsDone: r.entry.questsDone },
  );

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">Journal/</div>
          <h1>Jurnal & Habit</h1>
        </div>
      </div>

      <div className="kpis">
        <div className="panel kpi">
          <span className="eyebrow">Hari dijurnal</span>
          <b className="tnum">{d.inWindow}</b>
          <span className="muted" style={{ fontSize: ".82rem" }}>26 minggu terakhir</span>
        </div>
        <div className="panel kpi">
          <span className="eyebrow">Streak sekarang</span>
          <b className="tnum">{s.current}</b>
          <span className="muted" style={{ fontSize: ".82rem" }}>
            {s.best ? `rekor: ${s.best} hari (${fmtDate(s.bestFrom)} – ${fmtDate(s.bestTo)})` : "belum ada rekor"}
          </span>
        </div>
        <div className="panel kpi">
          <span className="eyebrow">Bolong terpanjang</span>
          <b className="tnum" style={s.gap >= 7 ? { color: "var(--warn)" } : undefined}>{s.gap}</b>
          <span className="muted" style={{ fontSize: ".82rem" }}>{s.gap ? `${fmtDate(s.gapFrom)} – ${fmtDate(s.gapTo)}` : "ga pernah bolong"}</span>
        </div>
        <div className="panel kpi">
          <span className="eyebrow">Habit hari ini</span>
          <b className="tnum">
            {d.habitsToday.done}/{d.habitsToday.total}
          </b>
          <span className="muted" style={{ fontSize: ".82rem" }}>
            {d.habitsToday.missed ? `${d.habitsToday.missed} terlewat · ` : ""}dari Habits.md
          </span>
        </div>
      </div>

      <section className="panel">
        <div className="panel-h">
          <h2>Heatmap jurnal</h2>
        </div>
        <div className="heat-wrap">
          <div className="heat-months">
            {weeks.map((m, i) => (
              <span key={i} style={{ width: 16, flex: "none" }}>
                {i === 0 || weeks[i - 1] !== m ? BULAN[m] : ""}
              </span>
            ))}
          </div>
          <div className="heat">
            {d.cells.map((c, i) => (
              <i key={c.date} style={{ "--w": Math.floor(i / 7) } as React.CSSProperties} data-l={c.level} title={`${c.date} · ${c.level ? "jurnal ada" : "kosong"}`} className={c.date === d.today ? "today" : undefined} />
            ))}
          </div>
        </div>
        <div className="legend">
          kosong <i style={{ background: "var(--h0)" }} />
          <i style={{ background: "var(--h1)" }} />
          <i style={{ background: "var(--h2)" }} />
          <i style={{ background: "var(--h3)" }} />
          <i style={{ background: "var(--h4)" }} /> ringkasan panjang
        </div>
        <p className="muted" style={{ margin: "4px 0 0", fontSize: ".74rem" }}>
          Warna = panjang ringkasan hari itu (pendek → panjang).
        </p>
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2>Habit 14 hari</h2>
        </div>
        {d.strip.length ? (
          <>
            <div style={{ overflowX: "auto" }}>
              <div className="habit-strip">
                {d.strip.map((h) => [
                  <span key={h.id}>{h.label.split(" ").slice(0, 3).join(" ")}</span>,
                  ...h.days.map((x, di) => (
                    <i
                      key={h.id + x.date}
                      style={{ "--d": di } as React.CSSProperties}
                      className={x.state ?? undefined}
                      title={`${x.date === d.today ? "hari ini" : x.date} · ${x.state === "done" ? "selesai" : x.state === "missed" ? "terlewat" : "kosong"}`}
                    />
                  )),
                ])}
              </div>
            </div>
            <div className="legend" style={{ flexWrap: "wrap" }}>
              <i className="done" /> selesai <i className="missed" style={{ marginLeft: 8 }} /> terlewat <i style={{ background: "var(--h0)", marginLeft: 8 }} /> kosong
              <span className="src" style={{ marginLeft: "auto" }}>Habits.md · frontmatter habits</span>
            </div>
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Belum ada habit di Habits.md.</p>
        )}
      </section>

      <JournalDays rows={rows} tags={d.tags} today={d.today} entries={d.entries} habitDefs={d.habitDefs} />
    </>
  );
}

/** Ringkasan buat timeline: teks polos, tapi baris tetap dijaga biar enak dibaca pas di-expand. */
function summaryText(md: string) {
  return md
    .split(/\r?\n/)
    .map((l) => plain(l))
    .filter(Boolean)
    .join("\n");
}

export default function Page() {
  return (
    <div className="view jpage">
      <Suspense fallback={<Loading />}>
        <Journal />
      </Suspense>
    </div>
  );
}
