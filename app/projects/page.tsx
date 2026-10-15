import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { getProjects } from "@/lib/vault/views";
import { ProjectsView } from "./projects-view";

const FILTERS = ["all", "personal", "work", "archived"] as const;

async function Projects({ searchParams }: { searchParams: PageProps<"/projects">["searchParams"] }) {
  const [projects, sp] = await Promise.all([getProjects(), searchParams]);
  const f = typeof sp.f === "string" && (FILTERS as readonly string[]).includes(sp.f) ? (sp.f as (typeof FILTERS)[number]) : "all";
  const p = typeof sp.p === "string" ? sp.p : null;
  // key: navigasi ke ?p= lain (dari palette / Hari ini) harus buka drawer yang baru
  return <ProjectsView key={`${f}:${p ?? ""}`} projects={projects} initialFilter={f} initialOpen={p} />;
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
