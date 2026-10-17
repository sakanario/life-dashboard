import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/** Yang boleh dibuka tanpa login. */
const PUBLIC = new Set(["/login", "/api/login"]);

/**
 * Gerbang login authenticator (REQUIREMENTS §9): semua halaman & API butuh sesi, termasuk dari localhost.
 * Route tulis juga ngecek ulang sesi di lib/api.ts (jaga-jaga kalau matcher berubah).
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.has(pathname)) return NextResponse.next();
  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return Response.json({ error: "Belum login" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // aset build Next, favicon & background ga perlu login (isinya bukan data vault)
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico$|super-cub-bg\\.jpg$).*)"],
};
