import { Suspense } from "react";
import { configuredPin } from "@/lib/auth";
import { LoginForm } from "./login-form";

/** `next` cuma boleh path di app ini (jangan sampai jadi open redirect ke situs lain). */
const safeNext = (v: unknown) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/");

async function Login({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  return <LoginForm next={safeNext(sp.next)} ready={!!configuredPin()} />;
}

export default function Page({ searchParams }: PageProps<"/login">) {
  return (
    <main className="login-wrap">
      <Suspense fallback={null}>
        <Login searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
