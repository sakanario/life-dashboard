import type { MetadataRoute } from "next";

/** Biar bisa di-"Install"/"Add to Home Screen". Ikon PNG-nya di public/ (versi solid, bukan kaca). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Life Dashboard",
    short_name: "Life",
    description: "Dashboard pribadi di atas vault markdown",
    start_url: "/",
    display: "standalone",
    background_color: "#8ec5c9",
    theme_color: "#8ec5c9",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
