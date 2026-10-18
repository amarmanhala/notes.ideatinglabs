CREATE TABLE IF NOT EXISTS notes (
  owner_id TEXT NOT NULL CHECK (length(owner_id) = 64),
  day TEXT NOT NULL CHECK (length(day) = 10),
  entry TEXT NOT NULL CHECK (json_valid(entry)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  saved_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, day)
);
