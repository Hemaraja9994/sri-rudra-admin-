-- Uploaded files, diagnostic reports and therapy plans for the Audiology and SLP dashboards.
-- Additive only: three NEW tables in the portal database (sri-rudra-portal-db).
-- No existing table or column is changed. Safe to run more than once.
-- The uploaded files themselves are kept in Workers KV (binding FILES); these tables hold the index.

CREATE TABLE IF NOT EXISTS clin_files (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id        INTEGER NOT NULL REFERENCES clin_patients(id) ON DELETE CASCADE,
  kv_key            TEXT NOT NULL,              -- where the file is stored in KV
  file_name         TEXT NOT NULL,
  content_type      TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  ai_summary        TEXT,                       -- what the AI read from it, as checked by the clinician
  uploaded_by       INTEGER,
  uploaded_by_name  TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clin_files_patient ON clin_files(patient_id, created_at);

CREATE TABLE IF NOT EXISTS clin_reports (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id        INTEGER NOT NULL REFERENCES clin_patients(id) ON DELETE CASCADE,
  template          TEXT NOT NULL,              -- aud_eval | slp_voice | slp_fluency | slp_child | slp_adult
  report_no         TEXT,                       -- e.g. SRC/VT/1/Nov/2026
  title             TEXT,
  report_date       TEXT NOT NULL,              -- YYYY-MM-DD
  valid_until       TEXT,                       -- YYYY-MM-DD
  status            TEXT NOT NULL DEFAULT 'draft',  -- draft | final
  data_json         TEXT NOT NULL DEFAULT '{}', -- the filled-in template
  clinician         TEXT,
  qualification     TEXT,
  rci_no            TEXT,
  ai_used           INTEGER NOT NULL DEFAULT 0, -- 1 when any part was drafted with AI (internal record)
  created_by        INTEGER,
  created_by_name   TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_clin_reports_patient ON clin_reports(patient_id, report_date);
CREATE INDEX IF NOT EXISTS idx_clin_reports_no ON clin_reports(report_no);

CREATE TABLE IF NOT EXISTS clin_plans (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id        INTEGER NOT NULL REFERENCES clin_patients(id) ON DELETE CASCADE,
  report_id         INTEGER,                    -- the report it was planned from, if any
  title             TEXT NOT NULL,
  sessions_count    INTEGER NOT NULL,
  minutes           INTEGER,
  per_week          INTEGER,
  start_date        TEXT,
  focus             TEXT,                       -- clinician's notes on approach, given to the AI
  status            TEXT NOT NULL DEFAULT 'draft',  -- draft | active | completed
  plan_json         TEXT NOT NULL DEFAULT '{}', -- goals, sessions, discharge criteria, home card
  progress_json     TEXT NOT NULL DEFAULT '{}', -- sessions done, progress data sheet values
  ai_used           INTEGER NOT NULL DEFAULT 0,
  created_by        INTEGER,
  created_by_name   TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clin_plans_patient ON clin_plans(patient_id);
