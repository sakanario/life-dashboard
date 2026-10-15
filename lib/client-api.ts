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

export type QuestRef = { id: string; file: string; line: number };
const qurl = (id: string) => `/api/quests/${encodeURIComponent(id)}`;

export const api = {
  toggleQuest: (id: string, text: string, done: boolean) =>
    send<ToggleResult>("PATCH", qurl(id), { text, done }),
  addQuest: (text: string, target: { project?: string | null; goal?: string | null }) =>
    send<QuestRef>("POST", "/api/quests", { text, ...target }),
  editQuest: (id: string, text: string, newText: string) => send<QuestRef>("PATCH", qurl(id), { text, newText }),
  moveQuest: (id: string, text: string, move: "up" | "down") => send<QuestRef>("PATCH", qurl(id), { text, move }),
  deleteQuest: (id: string, text: string) => send<{ file: string; line: number; removed: number }>("DELETE", qurl(id), { text }),
  setProjectStatus: (slug: string, status: string) => send<{ file: string; status: string }>("PATCH", `/api/projects/${encodeURIComponent(slug)}`, { status }),
  createProject: (body: { title: string; type: string; status?: string; goal?: string | null; desc?: string }) =>
    send<{ slug: string; file: string }>("POST", "/api/projects", body),
  archiveProject: (slug: string) =>
    send<{ slug: string; from: string; to: string; prevStatus: string }>("POST", `/api/projects/${encodeURIComponent(slug)}/archive`, {}),
  restoreProject: (slug: string, status?: string) =>
    send<{ slug: string; from: string; to: string; status: string }>("POST", `/api/projects/${encodeURIComponent(slug)}/restore`, { status }),
  createGoal: (body: { title: string; horizon: string; target?: string | null; desc?: string }) =>
    send<{ slug: string; file: string }>("POST", "/api/goals", body),
  createIdea: (title: string, project?: string | null) => send<{ slug: string; file: string }>("POST", "/api/content", { title, project }),
  updateContent: (
    slug: string,
    patch: {
      stage?: string;
      platform?: string[];
      project?: string | null;
      published?: string | null;
      stats?: { views?: number | null; comments?: number | null; retention?: string | null };
    },
  ) => send<{ file: string; changed: string[]; published: string | null }>("PATCH", `/api/content/${encodeURIComponent(slug)}`, patch),
  setGoalStatus: (slug: string, status: string) => send<{ file: string; status: string }>("PATCH", `/api/goals/${encodeURIComponent(slug)}`, { status }),
  saveJournal: (
    date: string,
    body: { highlight?: string; summary?: string; habits?: Record<string, "done" | "missed" | null>; base?: { highlight?: string; summary?: string } },
  ) => send<{ file: string; created: boolean; changed: boolean }>("PUT", `/api/journal/${date}`, body),
};
