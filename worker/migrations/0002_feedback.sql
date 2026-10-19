CREATE TABLE IF NOT EXISTS feedback (
  owner_id TEXT NOT NULL CHECK (length(owner_id) = 64),
  id TEXT NOT NULL CHECK (length(id) = 36),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, id)
);
