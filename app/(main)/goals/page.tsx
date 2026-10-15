import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { fmtDate } from "@/lib/vault/dates";
import { getGoals } from "@/lib/vault/views";
import { GoalCard, GoalsHead } from "./goal-ui";

const HORIZON = [
  { key: "vision", label: "Big vision", sub: "jangka panjang" },
  { key: "medium", label: "Medium goals", sub: "1–2 tahun" },
  { key: "year", label: "Tahun ini", sub: "" },
  { key: "quarter", label: "Kuartal ini", sub: "" },
] as const;

async function Goals() {
  const goals = await getGoals();
  const year = new Date().getFullYear();
  return (
    <>
      <GoalsHead />
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
