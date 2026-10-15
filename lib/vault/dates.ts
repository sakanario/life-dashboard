export const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export const iso = (d: Date) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

/** "2026-10-15" → Date lokal tengah malam (tanpa geser zona waktu). */
export const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (s: string, n: number) => {
  const d = fromIso(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};

/** Selisih hari kalender b − a. */
export const dayDiff = (a: string, b: string) => Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / 86400000);

export const todayIso = () => iso(new Date());

export const isIsoDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** "2026-07-13" → "13 Jul" */
export const fmtDate = (s: string | null | undefined) => {
  if (!isIsoDate(s)) return "—";
  const [, m, d] = s.split("-").map(Number);
  return d + " " + BULAN[m - 1];
};

/** Waktu simpan terakhir file (mtime): "21:04" kalau hari ini, selain itu "13 Jul 21:04". */
export const savedLabel = (mtime: number, today: string) => {
  const d = new Date(mtime);
  const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  return iso(d) === today ? hm : fmtDate(iso(d)) + " " + hm;
};
