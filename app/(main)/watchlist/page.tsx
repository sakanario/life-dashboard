import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { getWatch } from "@/lib/vault/views";
import { WatchView } from "./watch-view";

async function Watch() {
  return <WatchView items={await getWatch()} />;
}

export default function Page() {
  return (
    <div className="view">
      <Suspense fallback={<Loading />}>
        <Watch />
      </Suspense>
    </div>
  );
}
