CREATE TABLE layouts (
  id TEXT PRIMARY KEY NOT NULL,
  model TEXT NOT NULL,
  version TEXT NOT NULL,
  is_latest INTEGER NOT NULL DEFAULT 0,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE editors (
  email TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_layouts_model_latest ON layouts(model, is_latest);

PRAGMA optimize;
