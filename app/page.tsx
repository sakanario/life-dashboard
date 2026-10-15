import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { getToday } from "@/lib/vault/views";
import { TodayView } from "./today-view";

function greet(h: number) {
  return h < 11 ? "Pagi" : h < 15 ? "Siang" : h < 18 ? "Sore" : "Malam";
}

async function Today({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, sp] = await Promise.all([getToday(), searchParams]);
  const hour = new Date().getHours();
  const name = process.env.USER_NAME?.trim();
  return <TodayView data={data} hour={hour} greeting={`${greet(hour)}${name ? ", " + name : ""}.`} journalOpen={sp.jurnal === "1"} />;
}

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <div className="view">
      <Suspense fallback={<Loading />}>
        <Today searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
