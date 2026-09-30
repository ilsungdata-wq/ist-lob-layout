CREATE TABLE IF NOT EXISTS layout_history (
 id TEXT PRIMARY KEY NOT NULL,
 layout_id TEXT NOT NULL,
 model TEXT NOT NULL,
 version TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 data_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_history_model_date ON layout_history(model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_layout ON layout_history(layout_id);
