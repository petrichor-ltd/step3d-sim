CREATE TABLE IF NOT EXISTS usage_totals (
  day TEXT NOT NULL,
  event_type TEXT NOT NULL,
  step_schema TEXT NOT NULL DEFAULT 'None',
  failure_code TEXT NOT NULL DEFAULT 'none',
  event_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, event_type, step_schema, failure_code)
);

CREATE TABLE IF NOT EXISTS daily_visitors (
  day TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (day, visitor_hash)
);

CREATE TABLE IF NOT EXISTS event_receipts (
  day TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,
  step_schema TEXT NOT NULL DEFAULT 'None',
  failure_code TEXT NOT NULL DEFAULT 'none',
  created_at TEXT NOT NULL,
  PRIMARY KEY (day, session_hash, event_type, step_schema, failure_code)
);

CREATE INDEX IF NOT EXISTS usage_totals_day_idx ON usage_totals(day);
CREATE INDEX IF NOT EXISTS daily_visitors_day_idx ON daily_visitors(day);
CREATE INDEX IF NOT EXISTS event_receipts_day_idx ON event_receipts(day);

