import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { STAGE_KEYS } from "@/lib/vault/content-format";
import { getContent, getProjects } from "@/lib/vault/views";
import { Board } from "./board";

async function Content({ searchParams }: { searchParams: PageProps<"/content">["searchParams"] }) {
  const [items, projects, sp] = await Promise.all([getContent(), getProjects(), searchParams]);
  const odd = items.filter((c) => !STAGE_KEYS.includes(c.stage));
  return (
    <Board
      items={items}
      projects={projects.filter((p) => !p.isArchived).map((p) => ({ slug: p.slug, title: p.title }))}
      initialOpen={typeof sp.c === "string" ? sp.c : null}
      initialAdd={sp.ide === "1"}
      notice={
        odd.length ? (
          <div className="alert" role="note">
            <div>
              <b>{odd.length} konten punya stage yang ga dikenal:</b> {odd.map((c) => `${c.file} (${c.stage})`).join(", ")}. Buka kartunya di Catatan & benerin field stage.
            </div>
          </div>
        ) : null
      }
    />
  );
}

export default function Page({ searchParams }: PageProps<"/content">) {
  return (
    <div className="view">
      <Suspense fallback={<Loading />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
