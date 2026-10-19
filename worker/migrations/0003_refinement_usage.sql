CREATE TABLE IF NOT EXISTS refinement_usage (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  day TEXT NOT NULL,
  paragraphs INTEGER NOT NULL CHECK (paragraphs BETWEEN 1 AND 20),
  expires_at INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
);
CREATE INDEX IF NOT EXISTS refinement_usage_owner_day ON refinement_usage(owner_id, day);
