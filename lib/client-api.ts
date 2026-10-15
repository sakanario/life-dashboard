/** Panggilan API tulis dari browser. Error dilempar dengan pesan dari server. */

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

async function send<T>(method: string, url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Ga nyambung ke server");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Gagal (${res.status})`, data.detail);
  return data as T;
}

export type ToggleResult = {
  id: string;
  file: string;
  line: number;
  done: boolean;
  doneAt: string | null;
  journal: { file: string; action: "added" | "removed" | "not-found" | "none" };
};

export const api = {
  toggleQuest: (id: string, text: string, done: boolean) =>
    send<ToggleResult>("PATCH", `/api/quests/${encodeURIComponent(id)}`, { text, done }),
  addQuest: (text: string, project: string | null) =>
    send<{ id: string; file: string; line: number }>("POST", "/api/quests", { text, project }),
  saveJournal: (
    date: string,
    body: { highlight?: string; summary?: string; habits?: Record<string, "done" | "missed" | null>; base?: { highlight?: string; summary?: string } },
  ) => send<{ file: string; created: boolean; changed: boolean }>("PUT", `/api/journal/${date}`, body),
};
