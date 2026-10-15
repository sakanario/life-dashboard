import { getVault } from "@/lib/vault";

export async function GET(req: Request) {
  const v = await getVault();
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? "0000-00-00", to = sp.get("to") ?? "9999-99-99";
  return Response.json(v.journal.filter((j) => j.date >= from && j.date <= to));
}
