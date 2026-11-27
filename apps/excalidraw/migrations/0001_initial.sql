-- Each board stores its Excalidraw scene while large binary files live in R2.
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scene_json TEXT NOT NULL DEFAULT '{"elements":[],"appState":{}}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS boards_active_updated_idx
ON boards (deleted_at, updated_at DESC);

-- This mapping lets the worker locate and clean up each board's R2 files.
CREATE TABLE IF NOT EXISTS board_files (
  board_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (board_id, file_id),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);
