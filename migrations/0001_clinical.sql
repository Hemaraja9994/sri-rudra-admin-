-- Clinician dashboards (Audiology and Speech-Language Pathology) for the Sri Rudra admin portal.
-- Additive only: two NEW tables in the portal database (sri-rudra-portal-db).
-- No existing table or column is changed. Safe to run more than once.

CREATE TABLE IF NOT EXISTS clin_patients (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_no           TEXT,                       -- AUD-2026-0001 / SLP-2026-0001
  division         TEXT NOT NULL,              -- audiology | slp
  name             TEXT NOT NULL,
  phone            TEXT,                       -- digits only; links to appointments, reports, trials, sales
  sex              TEXT,
  dob              TEXT,                       -- YYYY-MM-DD, or
  age_years        INTEGER,                    -- age at registration when DOB is not known
  file_no          TEXT,                       -- clinic file number / UHID
  clinic_id        INTEGER,
  diagnosis        TEXT NOT NULL,              -- category id (see shared/clinical.js)
  diagnosis_detail TEXT,
  ear              TEXT,                       -- audiology: both | right | left
  degree           TEXT,                       -- audiology: degree of hearing loss
  stage            TEXT NOT NULL,              -- care stage id
  priority         TEXT NOT NULL DEFAULT 'routine',
  next_review      TEXT,                       -- YYYY-MM-DD
  referred_by      TEXT,
  clinician        TEXT,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'active',  -- active | discharged
  created_by       INTEGER,
  created_by_name  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clin_patients_division ON clin_patients(division, status, next_review);
CREATE INDEX IF NOT EXISTS idx_clin_patients_phone ON clin_patients(phone);

CREATE TABLE IF NOT EXISTS clin_entries (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id       INTEGER NOT NULL REFERENCES clin_patients(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL,              -- session | test | plan | note | stage
  title            TEXT,
  body             TEXT,
  stage_from       TEXT,
  stage_to         TEXT,
  entry_date       TEXT NOT NULL,              -- YYYY-MM-DD
  created_by       INTEGER,
  created_by_name  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clin_entries_patient ON clin_entries(patient_id, entry_date);
