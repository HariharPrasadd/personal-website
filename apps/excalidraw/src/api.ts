import type { ApiResponse, BoardScene, BoardSummary, WorkspaceLibrary } from "./types";

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(payload?.error ?? "The request failed.", response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json()) as ApiResponse<T>;
  return payload.data;
}

export const api = {
  getLibrary: () => request<WorkspaceLibrary>("/library"),
  saveLibrary: (items: WorkspaceLibrary) =>
    request<void>("/library", { method: "PUT", body: JSON.stringify({ items }) }),
  listBoards: () => request<BoardSummary[]>("/boards"),
  createBoard: (name: string) =>
    request<BoardSummary>("/boards", { method: "POST", body: JSON.stringify({ name }) }),
  renameBoard: (id: string, name: string) =>
    request<BoardSummary>(`/boards/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteBoard: (id: string) => request<void>(`/boards/${id}`, { method: "DELETE" }),
  getScene: (id: string) => request<BoardScene>(`/boards/${id}/scene`),
  saveScene: (id: string, scene: BoardScene) =>
    request<void>(`/boards/${id}/scene`, { method: "PUT", body: JSON.stringify(scene) }),
  login: (password: string) =>
    request<void>("/login", { method: "POST", body: JSON.stringify({ password }) }),
};

export { ApiError };
