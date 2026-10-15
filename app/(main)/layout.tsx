import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { getShell } from "@/lib/vault/views";

async function ShellSidebar() {
  return <Sidebar data={await getShell()} />;
}

/** Semua halaman app (butuh login): menu samping + konten. Halaman login di luar grup ini. */
export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="app">
      <Suspense fallback={<Sidebar data={null} />}>
        <ShellSidebar />
      </Suspense>
      <main className="main" id="main">
        {children}
      </main>
    </div>
  );
}
