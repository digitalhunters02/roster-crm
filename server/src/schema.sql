-- Roster CRM schema
-- Crestline Talent Partners — Austin, TX

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  initials TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  address TEXT NOT NULL,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  title TEXT NOT NULL,
  employment_type TEXT NOT NULL,
  pay_range TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  opened_date TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  current_title TEXT NOT NULL,
  current_employer TEXT NOT NULL,
  skills TEXT NOT NULL,
  resume_summary TEXT,
  source TEXT NOT NULL,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  stage TEXT NOT NULL,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  submitted_date TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS interviews (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  interviewer_name TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS placements (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  start_date TEXT NOT NULL,
  end_date TEXT,
  pay_rate REAL NOT NULL,
  bill_rate REAL NOT NULL,
  placement_fee REAL NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timesheets_invoices (
  id SERIAL PRIMARY KEY,
  placement_id INTEGER NOT NULL REFERENCES placements(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  hours REAL NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  subject TEXT NOT NULL,
  related_type TEXT,
  related_id INTEGER,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  occurred_at TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS automations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_desc TEXT NOT NULL,
  action_desc TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  runs_30d INTEGER NOT NULL DEFAULT 0
);

-- A single shared WhatsApp Business number for the whole company (staff share
-- one connection rather than each connecting their own) — one row, id is always 1.
CREATE TABLE IF NOT EXISTS whatsapp_connection (
  id INTEGER PRIMARY KEY DEFAULT 1,
  phone_number_id TEXT NOT NULL,
  business_account_id TEXT,
  access_token TEXT NOT NULL,
  verify_token TEXT,
  display_phone TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_connection_single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id TEXT PRIMARY KEY,
  wa_message_id TEXT UNIQUE,
  contact_phone TEXT NOT NULL,
  direction TEXT NOT NULL,
  body TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contact ON whatsapp_messages (contact_phone, created_at);
