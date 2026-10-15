import { connection } from "next/server";
import { onVaultChange } from "@/lib/vault";

/** SSE: kabarin UI tiap ada file vault yang berubah (dari app, Claude Code, atau Obsidian). */
export async function GET(req: Request) {
  await connection();
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const send = (event: string, data: unknown) => ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("ready", { at: Date.now() });
      const off = onVaultChange((e) => send("change", e));
      const ping = setInterval(() => ctrl.enqueue(enc.encode(": ping\n\n")), 25000);
      cleanup = () => { off(); clearInterval(ping); };
      req.signal.addEventListener("abort", () => { cleanup(); try { ctrl.close(); } catch {} });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
