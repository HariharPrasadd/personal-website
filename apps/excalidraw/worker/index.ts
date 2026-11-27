interface Env {
  EXCALIDRAW_DB: D1Database;
  EXCALIDRAW_FILES: R2Bucket;
  ASSETS: Fetcher;
  APP_PASSWORD: string;
  SESSION_SECRET: string;
}

interface BoardRow {
  id: string;
  name: string;
  scene_json: string;
  created_at: string;
  updated_at: string;
}

interface StoredFileRow {
  file_id: string;
  object_key: string;
}

interface LibraryRow {
  library_json: string;
}

const SESSION_COOKIE = "draw_session";
const LIBRARY_OBJECT_KEY = "workspace/library.json";
const MAX_LIBRARY_BYTES = 50_000_000;
const encoder = new TextEncoder();

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name) cookies.set(name, value.join("="));
  }
  return cookies;
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signSession(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode("harihar-excalidraw-session-v1")));
}

async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  const actual = parseCookies(request).get(SESSION_COOKIE) ?? "";
  const expected = await signSession(env.SESSION_SECRET);
  if (actual.length !== expected.length) return false;

  // Compare every byte so password/session checks do not leak a useful timing signal.
  let mismatch = 0;
  for (let index = 0; index < actual.length; index += 1) {
    mismatch |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

async function readBody<T>(request: Request): Promise<T> {
  return request.json<T>();
}

function boardSummary(row: BoardRow) {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function routeApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.slice(4);

  if (path === "/login" && request.method === "POST") {
    const body = await readBody<{ password?: string }>(request);
    if (!body.password || body.password !== env.APP_PASSWORD) return json({ error: "Incorrect password." }, 401);
    const token = await signSession(env.SESSION_SECRET);
    return json({ data: null }, 200, {
      "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`,
    });
  }

  if (!(await isAuthenticated(request, env))) return json({ error: "Authentication required." }, 401);

  if (path === "/library" && request.method === "GET") {
    const stored = await env.EXCALIDRAW_FILES.get(LIBRARY_OBJECT_KEY);
    if (stored) return json({ data: await stored.json() });
    // Libraries saved before the move to R2 still live in D1; serve them until the next save migrates them.
    // Only a missing table means "nothing to migrate"; any other failure must surface, because the
    // client merges its next save into whatever this returns and an empty result would drop items.
    const legacy = await env.EXCALIDRAW_DB.prepare(
      "SELECT library_json FROM workspace_library WHERE id = 1",
    ).first<LibraryRow>().catch((error: unknown) => {
      if (String(error).includes("no such table")) return null;
      throw error;
    });
    return json({ data: legacy ? JSON.parse(legacy.library_json) : [] });
  }

  if (path === "/library" && request.method === "PUT") {
    const body = await readBody<{ items?: unknown[] }>(request);
    if (!Array.isArray(body.items)) return json({ error: "Invalid library data." }, 400);
    const serialized = JSON.stringify(body.items);
    if (serialized.length > MAX_LIBRARY_BYTES) return json({ error: "The library is too large." }, 413);
    // R2 rather than D1: a D1 row is capped at ~2 MB, which a few imported libraries can exceed.
    await env.EXCALIDRAW_FILES.put(LIBRARY_OBJECT_KEY, serialized, {
      httpMetadata: { contentType: "application/json" },
    });
    return new Response(null, { status: 204 });
  }

  if (path === "/boards" && request.method === "GET") {
    const result = await env.EXCALIDRAW_DB.prepare(
      "SELECT id, name, created_at, updated_at FROM boards WHERE deleted_at IS NULL ORDER BY updated_at DESC",
    ).all<BoardRow>();
    return json({ data: result.results.map(boardSummary) });
  }

  if (path === "/boards" && request.method === "POST") {
    const body = await readBody<{ name?: string }>(request);
    const name = body.name?.trim().slice(0, 120);
    if (!name) return json({ error: "A drawing name is required." }, 400);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.EXCALIDRAW_DB.prepare(
      "INSERT INTO boards (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).bind(id, name, now, now).run();
    return json({ data: { id, name, createdAt: now, updatedAt: now } }, 201);
  }

  const sceneMatch = path.match(/^\/boards\/([a-f0-9-]+)\/scene$/i);
  if (sceneMatch && request.method === "GET") {
    const id = sceneMatch[1];
    const board = await env.EXCALIDRAW_DB.prepare(
      "SELECT id, scene_json FROM boards WHERE id = ? AND deleted_at IS NULL",
    ).bind(id).first<Pick<BoardRow, "id" | "scene_json">>();
    if (!board) return json({ error: "Drawing not found." }, 404);

    const rows = await env.EXCALIDRAW_DB.prepare(
      "SELECT file_id, object_key FROM board_files WHERE board_id = ?",
    ).bind(id).all<StoredFileRow>();
    const fileEntries = await Promise.all(rows.results.map(async (row) => {
      const object = await env.EXCALIDRAW_FILES.get(row.object_key);
      return object ? [row.file_id, await object.json()] as const : null;
    }));
    return json({ data: { ...JSON.parse(board.scene_json), files: Object.fromEntries(fileEntries.filter(Boolean) as [string, unknown][]) } });
  }

  if (sceneMatch && request.method === "PUT") {
    const id = sceneMatch[1];
    const body = await readBody<{ elements?: unknown[]; appState?: object; files?: Record<string, unknown> }>(request);
    if (!Array.isArray(body.elements)) return json({ error: "Invalid drawing data." }, 400);
    const existing = await env.EXCALIDRAW_DB.prepare("SELECT id FROM boards WHERE id = ? AND deleted_at IS NULL").bind(id).first();
    if (!existing) return json({ error: "Drawing not found." }, 404);

    const files = body.files ?? {};
    const now = new Date().toISOString();
    await Promise.all(Object.entries(files).map(async ([fileId, file]) => {
      const objectKey = `${id}/${fileId}.json`;
      await env.EXCALIDRAW_FILES.put(objectKey, JSON.stringify(file), { httpMetadata: { contentType: "application/json" } });
      await env.EXCALIDRAW_DB.prepare(
        "INSERT INTO board_files (board_id, file_id, object_key, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(board_id, file_id) DO UPDATE SET object_key = excluded.object_key, updated_at = excluded.updated_at",
      ).bind(id, fileId, objectKey, now).run();
    }));
    await env.EXCALIDRAW_DB.prepare(
      "UPDATE boards SET scene_json = ?, updated_at = ? WHERE id = ?",
    ).bind(JSON.stringify({ elements: body.elements, appState: body.appState ?? {} }), now, id).run();
    return new Response(null, { status: 204 });
  }

  const boardMatch = path.match(/^\/boards\/([a-f0-9-]+)$/i);
  if (boardMatch && request.method === "PATCH") {
    const body = await readBody<{ name?: string }>(request);
    const name = body.name?.trim().slice(0, 120);
    if (!name) return json({ error: "A drawing name is required." }, 400);
    const now = new Date().toISOString();
    const result = await env.EXCALIDRAW_DB.prepare(
      "UPDATE boards SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING id, name, created_at, updated_at",
    ).bind(name, now, boardMatch[1]).first<BoardRow>();
    if (!result) return json({ error: "Drawing not found." }, 404);
    return json({ data: boardSummary(result) });
  }

  if (boardMatch && request.method === "DELETE") {
    const now = new Date().toISOString();
    await env.EXCALIDRAW_DB.prepare(
      "UPDATE boards SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    ).bind(now, now, boardMatch[1]).run();
    return new Response(null, { status: 204 });
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await routeApi(request, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("Unhandled request error", error);
      return json({ error: "An unexpected error occurred." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
