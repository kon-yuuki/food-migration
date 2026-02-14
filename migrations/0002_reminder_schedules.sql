CREATE TABLE IF NOT EXISTS reminder_schedules (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  timezone TEXT NOT NULL,
  time TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_sent_local TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reminder_schedules_endpoint
  ON reminder_schedules (endpoint);

CREATE INDEX IF NOT EXISTS idx_reminder_schedules_enabled_time
  ON reminder_schedules (enabled, time);
