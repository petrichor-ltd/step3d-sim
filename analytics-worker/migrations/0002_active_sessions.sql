CREATE TABLE IF NOT EXISTS active_sessions (
  session_hash TEXT PRIMARY KEY,
  last_seen_epoch INTEGER NOT NULL
);
