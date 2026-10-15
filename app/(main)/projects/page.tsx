import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { getGoals, getProjectsPage } from "@/lib/vault/views";
import { ProjectsView } from "./projects-view";

const FILTERS = ["all", "personal", "work", "archived"] as const;

async function Projects({ searchParams }: { searchParams: PageProps<"/projects">["searchParams"] }) {
  const [projects, goals, sp] = await Promise.all([getProjectsPage(), getGoals(), searchParams]);
  const f = typeof sp.f === "string" && (FILTERS as readonly string[]).includes(sp.f) ? (sp.f as (typeof FILTERS)[number]) : "all";
  const p = typeof sp.p === "string" ? sp.p : null;
  // navigasi ke ?p= lain (palette / Hari ini) diikutin di dalam ProjectsView, bukan remount (state drawer tetap)
  return <ProjectsView projects={projects} goals={goals.map((g) => ({ slug: g.slug, title: g.title }))} initialFilter={f} initialOpen={p} />;
}

export default function Page({ searchParams }: PageProps<"/projects">) {
  return (
    <div className="view">
      <Suspense fallback={<Loading />}>
        <Projects searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
