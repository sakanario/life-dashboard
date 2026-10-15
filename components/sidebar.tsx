"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { NAV, NavIcon, PanelIcon } from "./icons";
import { api } from "@/lib/client-api";
import { Palette, type PaletteItem } from "./palette";

type Counts = { today: number; projects: number; content: number; watch: number };
export type ShellData = { vaultName: string; fileCount: number; counts: Counts; palette: PaletteItem[] };

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};

/** Status menu ada di <html data-side> (dipasang script di <head> sebelum paint). */
const subscribeSide = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-side"] });
  return () => mo.disconnect();
};
const sideSnapshot = () => document.documentElement.dataset.side !== "closed";

export function Sidebar({ data }: { data: ShellData | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const sideOpen = useSyncExternalStore(subscribeSide, sideSnapshot, () => true);
  const [palOpen, setPalOpen] = useState(false);
  const [live, setLive] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  const setSide = useCallback((open: boolean, focus: boolean) => {
    const r = document.documentElement;
    if (open) delete r.dataset.side;
    else r.dataset.side = "closed";
    store.set("ld-side", open ? "open" : "closed");
    if (focus) {
      const narrow = matchMedia("(max-width:760px)").matches;
      requestAnimationFrame(() => (open || narrow ? toggleRef.current : openRef.current)?.focus());
    }
  }, []);

  // live update dari file watcher: refresh data server tiap ada file vault berubah
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const es = new EventSource("/api/events");
    es.addEventListener("ready", () => setLive(true));
    es.addEventListener("change", () => {
      clearTimeout(t);
      t = setTimeout(() => router.refresh(), 120);
    });
    es.onerror = () => setLive(false);
    return () => { clearTimeout(t); es.close(); };
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const toggleTheme = () => {
    const r = document.documentElement;
    const next = r.dataset.theme === "dark" ? "light" : "dark";
    r.dataset.theme = next;
    store.set("ld-theme", next);
  };

  const current = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const counts = data?.counts;
  const countFor = (k: string) => (counts ? (counts as Record<string, number>)[k] : 0);

  return (
    <>
      <aside className="side">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <b>Life Dashboard</b>
            <div className="mono muted">vault: {data?.vaultName ?? "…"}</div>
          </div>
          <button
            ref={toggleRef}
            className="side-toggle"
            type="button"
            aria-controls="sideBody"
            aria-expanded={sideOpen}
            aria-label={sideOpen ? "Tutup menu" : "Buka menu"}
            title={sideOpen ? "Tutup menu" : "Buka menu"}
            onClick={() => setSide(!sideOpen, true)}
          >
            <PanelIcon />
          </button>
        </div>
        <div className="side-body" id="sideBody">
          <button className="search-btn" type="button" onClick={() => setPalOpen(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            Cari / tambah…<span className="kbd">Ctrl K</span>
          </button>
          <nav className="nav" aria-label="Menu">
            {NAV.map((n) => (
              <Link key={n.key} href={n.href} aria-current={current(n.href) ? "page" : undefined}>
                <NavIcon name={n.key} />
                {n.label}
                {countFor(n.key) ? <span className="count">{countFor(n.key)}</span> : null}
              </Link>
            ))}
          </nav>
          <div className="side-foot">
            <div className="sync">
              <span className={"dot" + (live ? "" : " off")} />
              {live ? "Vault tersinkron" : "Nyambung ke watcher…"} · <span className="tnum">{data?.fileCount ?? "…"} file</span>
            </div>
            <div className="sync mono">{live ? "watcher aktif" : "watcher belum nyambung"} · localhost:3000</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="btn sm" type="button" onClick={toggleTheme}>
                Ganti tema
              </button>
              <button
                className="btn sm"
                type="button"
                onClick={async () => {
                  try {
                    await api.logout();
                  } finally {
                    // reload penuh: cache client yang isinya data vault ikut dibuang
                    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                    location.assign("/login");
                  }
                }}
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      </aside>
      <button ref={openRef} className="side-open" type="button" aria-controls="sideBody" aria-expanded="false" onClick={() => setSide(true, true)}>
        <PanelIcon />
        Menu
      </button>
      {palOpen && <Palette items={data?.palette ?? []} onClose={() => setPalOpen(false)} />}
    </>
  );
}
