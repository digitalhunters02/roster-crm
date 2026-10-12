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

-- Login accounts (separate from "users", which are the agency's recruiters
-- shown on the Team card). Owner / staff roles; bcrypt password hashes.
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  token_version INTEGER NOT NULL DEFAULT 0,
  reset_token_hash TEXT,
  reset_token_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_lower_idx ON accounts (lower(email));
CREATE INDEX IF NOT EXISTS accounts_reset_token_idx ON accounts (reset_token_hash);

-- ---------- Planos e cobrança (Stripe da Impact Digital) ----------
-- Uma assinatura por instalação (linha única, id = 1), como no Parcel.
CREATE TABLE IF NOT EXISTS subscription (
  id INTEGER PRIMARY KEY DEFAULT 1,
  plan TEXT NOT NULL DEFAULT 'basico',
  status TEXT NOT NULL DEFAULT 'active',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  billing_interval TEXT NOT NULL DEFAULT 'month',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_single_row CHECK (id = 1)
);

-- Teste grátis de 3 dias (conta temporária que usa os dados de exemplo) e vínculo conta -> recrutador.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_demo_trial BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Automações que disparam de verdade: tipo do gatilho e da ação, e o histórico de execuções.
ALTER TABLE automations ADD COLUMN IF NOT EXISTS trigger_type TEXT;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS action_type TEXT;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS automation_runs (
  id SERIAL PRIMARY KEY,
  automation_id INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  related_type TEXT,
  related_id INTEGER,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_ran ON automation_runs (automation_id, ran_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_runs_once ON automation_runs (automation_id, related_type, related_id) WHERE related_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- ---------- Etapa 2: portal do cliente, fatura, mensagens ----------
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_token TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_portal_token ON clients (portal_token) WHERE portal_token IS NOT NULL;

ALTER TABLE timesheets_invoices ADD COLUMN IF NOT EXISTS client_approved_at TIMESTAMPTZ;
ALTER TABLE timesheets_invoices ADD COLUMN IF NOT EXISTS client_approved_by TEXT;
ALTER TABLE timesheets_invoices ADD COLUMN IF NOT EXISTS client_dispute_note TEXT;
ALTER TABLE timesheets_invoices ADD COLUMN IF NOT EXISTS invoice_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS portal_feedback (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  note TEXT,
  by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS sms_opt_out BOOLEAN NOT NULL DEFAULT FALSE;

-- One log of everything sent to / received from candidates by SMS and e-mail (WhatsApp keeps its own table).
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL,
  candidate_id INTEGER REFERENCES candidates(id) ON DELETE SET NULL,
  contact TEXT,
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT,
  external_id TEXT,
  account_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_candidate ON messages (candidate_id, created_at);

CREATE TABLE IF NOT EXISTS message_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The agency's own Twilio account (SMS). The auth token is stored encrypted and never sent back to the browser.
CREATE TABLE IF NOT EXISTS sms_connection (
  id INTEGER PRIMARY KEY DEFAULT 1,
  account_sid TEXT NOT NULL,
  auth_token_enc TEXT NOT NULL,
  from_number TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_connection_single_row CHECK (id = 1)
);
