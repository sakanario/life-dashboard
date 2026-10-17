/** Panggilan API tulis dari browser. Error dilempar dengan pesan dari server. */

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

async function send<T>(method: string, url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res =
      body instanceof FormData
        ? await fetch(url, { method, body }) // multipart: boundary diisi browser
        : await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Ga nyambung ke server");
  }
  if (res.status === 401 && url !== "/api/login") {
    // sesi habis / secret diganti → ke halaman login, balik lagi ke sini habis masuk
    // reload penuh (bukan router.push): cache client yang isinya data vault ikut dibuang
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    location.assign("/login?next=" + encodeURIComponent(location.pathname + location.search));
    throw new ApiError(401, "Sesi habis, login lagi");
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
const wurl = (slug: string) => `/api/watchlist/${encodeURIComponent(slug)}`;

export type WatchPatchBody = {
  epDelta?: 1 | -1;
  progress?: number;
  total?: number | null;
  status?: string;
  rating?: number | null;
  type?: string;
  coverPos?: { x: number; y: number; z: number } | null;
};

export const api = {
  login: (code: string) => send<{ ok: true; backupLeft: number | null }>("POST", "/api/login", { code }),
  logout: () => send<{ ok: true }>("POST", "/api/logout", {}),
  saveNote: (path: string, content: string, baseMtime: number, force = false) =>
    send<{ path: string; mtime: number }>("PUT", `/api/notes?path=${encodeURIComponent(path)}`, { content, baseMtime, force }),
  toggleQuest: (id: string, text: string, done: boolean) =>
    send<ToggleResult>("PATCH", qurl(id), { text, done }),
  addQuest: (text: string, target: { project?: string | null; goal?: string | null }) =>
    send<QuestRef>("POST", "/api/quests", { text, ...target }),
  editQuest: (id: string, text: string, newText: string) => send<QuestRef>("PATCH", qurl(id), { text, newText }),
  moveQuest: (id: string, text: string, move: "up" | "down") => send<QuestRef>("PATCH", qurl(id), { text, move }),
  moveQuestTo: (id: string, text: string, target: string, targetText: string, place: "before" | "after") =>
    send<QuestRef>("PATCH", qurl(id), { text, target, targetText, place }),
  deleteQuest: (id: string, text: string) => send<{ file: string; line: number; removed: number }>("DELETE", qurl(id), { text }),
  setProjectStatus: (slug: string, status: string) => send<{ file: string; status: string }>("PATCH", `/api/projects/${encodeURIComponent(slug)}`, { status }),
  setProjectDesc: (slug: string, desc: string, base: string) =>
    send<{ file: string; changed: boolean }>("PATCH", `/api/projects/${encodeURIComponent(slug)}`, { desc, base }),
  createProject: (body: { title: string; type: string; status?: string; goal?: string | null; desc?: string }) =>
    send<{ slug: string; file: string }>("POST", "/api/projects", body),
  archiveProject: (slug: string) =>
    send<{ slug: string; from: string; to: string; prevStatus: string }>("POST", `/api/projects/${encodeURIComponent(slug)}/archive`, {}),
  restoreProject: (slug: string, status?: string) =>
    send<{ slug: string; from: string; to: string; status: string }>("POST", `/api/projects/${encodeURIComponent(slug)}/restore`, { status }),
  deleteProject: (slug: string) => send<{ slug: string; from: string; to: string }>("DELETE", `/api/projects/${encodeURIComponent(slug)}`, {}),
  undeleteProject: (slug: string, from: string, to: string) =>
    send<{ slug: string; from: string; to: string }>("POST", `/api/projects/${encodeURIComponent(slug)}/undelete`, { from, to }),
  createGoal: (body: { title: string; horizon: string; target?: string | null; desc?: string }) =>
    send<{ slug: string; file: string }>("POST", "/api/goals", body),
  deleteContent: (slug: string) => send<{ slug: string; from: string; to: string }>("DELETE", `/api/content/${encodeURIComponent(slug)}`, {}),
  undeleteContent: (slug: string, from: string) =>
    send<{ slug: string; from: string; to: string }>("POST", `/api/content/${encodeURIComponent(slug)}/undelete`, { from }),
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
  updateGoal: (slug: string, patch: { title?: string; horizon?: string; target?: string | null; desc?: string }) =>
    send<{ slug: string; file: string; changed: string[] }>("PATCH", `/api/goals/${encodeURIComponent(slug)}`, patch),
  deleteGoal: (slug: string) => send<{ slug: string; from: string; to: string }>("DELETE", `/api/goals/${encodeURIComponent(slug)}`, {}),
  restoreGoal: (slug: string, from: string) =>
    send<{ slug: string; from: string; to: string }>("POST", `/api/goals/${encodeURIComponent(slug)}/restore`, { from }),
  createWatch: (body: { title: string; type: string; status?: string; total?: number | null }) =>
    send<{ slug: string; file: string }>("POST", "/api/watchlist", body),
  updateWatch: (slug: string, patch: WatchPatchBody) =>
    send<{ file: string; changed: string[]; progress: number; status: string }>("PATCH", wurl(slug), patch),
  uploadCover: (slug: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return send<{ file: string; cover: string; bytes: number }>("PUT", wurl(slug) + "/cover", fd);
  },
  removeCover: (slug: string) => send<{ file: string; removedFile: string | null }>("DELETE", wurl(slug) + "/cover", {}),
  deleteWatch: (slug: string) => send<{ slug: string; from: string; to: string }>("DELETE", wurl(slug), {}),
  undeleteWatch: (slug: string, from: string) => send<{ slug: string; from: string; to: string }>("POST", wurl(slug) + "/undelete", { from }),
  saveJournal: (
    date: string,
    body: { highlight?: string; summary?: string; habits?: Record<string, "done" | "missed" | null>; base?: { highlight?: string; summary?: string } },
  ) => send<{ file: string; created: boolean; changed: boolean }>("PUT", `/api/journal/${date}`, body),
};
