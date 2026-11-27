-- The workspace has one shared library because this deployment is single-user.
CREATE TABLE IF NOT EXISTS workspace_library (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  library_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
