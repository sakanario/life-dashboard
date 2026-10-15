import type { Metadata, Viewport } from "next";
import { Montserrat, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { getShell } from "@/lib/vault/views";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-montserrat" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Life Dashboard",
  description: "Dashboard pribadi di atas vault markdown",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

/**
 * Jalan sebelum paint: tema (terang default, tidak ikut sistem) + status menu samping.
 * Menu dipulihkan tanpa animasi, baru habis itu animasi dinyalain.
 */
const BOOT = `(function(){var r=document.documentElement;try{if(localStorage.getItem("ld-theme")==="dark")r.dataset.theme="dark";if(localStorage.getItem("ld-side")==="closed")r.dataset.side="closed";}catch(e){}r.setAttribute("data-side-instant","");var off=function(){r.removeAttribute("data-side-instant")};requestAnimationFrame(function(){requestAnimationFrame(off)});setTimeout(off,300)})()`;

async function ShellSidebar() {
  return <Sidebar data={await getShell()} />;
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" data-theme="light" className={`${montserrat.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body>
        <div className="app">
          <Suspense fallback={<Sidebar data={null} />}>
            <ShellSidebar />
          </Suspense>
          <main className="main" id="main">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
