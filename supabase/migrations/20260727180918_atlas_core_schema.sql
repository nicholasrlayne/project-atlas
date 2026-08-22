/*
# Atlas core schema

1. Purpose
Atlas is an AI operational memory layer for solo/small-crew field-service owners.
The owner talks or types during a visit; Atlas turns it into a visit summary,
tasks, and a proposal draft. This migration creates the full data model aligned
to the requested tables: customers, properties, visits (central object),
voice_recordings, typed_entries, photos, tasks, proposals, reminders.

This is a SINGLE-TENANT app for now (no sign-in screen in v1). All policies are
open to `anon, authenticated` so the anon-key frontend can read/write its own
data. No user_id columns and no auth.users foreign keys are introduced.

2. New Tables
- `customers` — top-level account (a property manager, HOA, business).
  - id (uuid pk), name (text), contact_name (text), contact_email (text),
    contact_phone (text), notes (text), created_at, updated_at.
- `properties` — physical sites belonging to a customer.
  - id (uuid pk), customer_id (fk -> customers), name (text), address (text),
    notes (text), created_at, updated_at.
- `visits` — the central object. One visit = one on-site session.
  - id (uuid pk), customer_id (fk), property_id (fk), service_type (text),
    status (text: 'active' | 'summarized' | 'saved'), started_at (timestamptz),
    ended_at (timestamptz), summary (text), created_at, updated_at.
- `voice_recordings` — audio captured during a visit.
  - id (uuid pk), visit_id (fk -> visits), transcript (text), duration_sec (int),
    storage_path (text), created_at.
- `typed_entries` — typed notes captured during a visit (same visit as voice).
  - id (uuid pk), visit_id (fk -> visits), body (text), created_at.
- `photos` — photos captured during a visit.
  - id (uuid pk), visit_id (fk -> visits), storage_path (text), caption (text),
    created_at.
- `tasks` — action items extracted from a visit.
  - id (uuid pk), visit_id (fk -> visits), title (text), due_context (text),
    status (text: 'open' | 'done'), created_at.
- `proposals` — proposal drafts generated from a visit.
  - id (uuid pk), visit_id (fk -> visits), title (text), price_text (text),
    description (text), status (text: 'draft' | 'sent'), created_at.
- `reminders` — surfaced on Home ("needs attention").
  - id (uuid pk), customer_id (fk -> customers, nullable), title (text),
    detail (text), severity (text: 'amber' | 'teal'), done (bool), due_date (date),
    created_at.

3. Indexes
- visits by customer and property; child rows by visit; reminders by done/due_date.

4. Security
- RLS enabled on every table.
- Single-tenant: CRUD open to `anon, authenticated` (USING (true) / WITH CHECK (true))
  because there is no sign-in screen and the data is intentionally shared.
  This is documented per-table in the policy comments.
*/

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name text,
  address text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  service_type text,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS voice_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  transcript text,
  duration_sec int,
  storage_path text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS typed_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  storage_path text,
  caption text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_context text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  title text,
  price_text text,
  description text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  title text NOT NULL,
  detail text,
  severity text NOT NULL DEFAULT 'amber',
  done boolean NOT NULL DEFAULT false,
  due_date date,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_visits_customer ON visits(customer_id);
CREATE INDEX IF NOT EXISTS idx_visits_property ON visits(property_id);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);
CREATE INDEX IF NOT EXISTS idx_voice_visit ON voice_recordings(visit_id);
CREATE INDEX IF NOT EXISTS idx_typed_visit ON typed_entries(visit_id);
CREATE INDEX IF NOT EXISTS idx_photos_visit ON photos(visit_id);
CREATE INDEX IF NOT EXISTS idx_tasks_visit ON tasks(visit_id);
CREATE INDEX IF NOT EXISTS idx_proposals_visit ON proposals(visit_id);
CREATE INDEX IF NOT EXISTS idx_reminders_open ON reminders(done, due_date);

-- Enable RLS on all tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE typed_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Policies (single-tenant, no auth: open CRUD to anon + authenticated)
-- customers
DROP POLICY IF EXISTS "anon_select_customers" ON customers;
CREATE POLICY "anon_select_customers" ON customers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_customers" ON customers;
CREATE POLICY "anon_insert_customers" ON customers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_customers" ON customers;
CREATE POLICY "anon_update_customers" ON customers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_customers" ON customers;
CREATE POLICY "anon_delete_customers" ON customers FOR DELETE TO anon, authenticated USING (true);

-- properties
DROP POLICY IF EXISTS "anon_select_properties" ON properties;
CREATE POLICY "anon_select_properties" ON properties FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_properties" ON properties;
CREATE POLICY "anon_insert_properties" ON properties FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_properties" ON properties;
CREATE POLICY "anon_update_properties" ON properties FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_properties" ON properties;
CREATE POLICY "anon_delete_properties" ON properties FOR DELETE TO anon, authenticated USING (true);

-- visits
DROP POLICY IF EXISTS "anon_select_visits" ON visits;
CREATE POLICY "anon_select_visits" ON visits FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_visits" ON visits;
CREATE POLICY "anon_insert_visits" ON visits FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_visits" ON visits;
CREATE POLICY "anon_update_visits" ON visits FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_visits" ON visits;
CREATE POLICY "anon_delete_visits" ON visits FOR DELETE TO anon, authenticated USING (true);

-- voice_recordings
DROP POLICY IF EXISTS "anon_select_voice_recordings" ON voice_recordings;
CREATE POLICY "anon_select_voice_recordings" ON voice_recordings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_voice_recordings" ON voice_recordings;
CREATE POLICY "anon_insert_voice_recordings" ON voice_recordings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_voice_recordings" ON voice_recordings;
CREATE POLICY "anon_update_voice_recordings" ON voice_recordings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_voice_recordings" ON voice_recordings;
CREATE POLICY "anon_delete_voice_recordings" ON voice_recordings FOR DELETE TO anon, authenticated USING (true);

-- typed_entries
DROP POLICY IF EXISTS "anon_select_typed_entries" ON typed_entries;
CREATE POLICY "anon_select_typed_entries" ON typed_entries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_typed_entries" ON typed_entries;
CREATE POLICY "anon_insert_typed_entries" ON typed_entries FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_typed_entries" ON typed_entries;
CREATE POLICY "anon_update_typed_entries" ON typed_entries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_typed_entries" ON typed_entries;
CREATE POLICY "anon_delete_typed_entries" ON typed_entries FOR DELETE TO anon, authenticated USING (true);

-- photos
DROP POLICY IF EXISTS "anon_select_photos" ON photos;
CREATE POLICY "anon_select_photos" ON photos FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_photos" ON photos;
CREATE POLICY "anon_insert_photos" ON photos FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_photos" ON photos;
CREATE POLICY "anon_update_photos" ON photos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_photos" ON photos;
CREATE POLICY "anon_delete_photos" ON photos FOR DELETE TO anon, authenticated USING (true);

-- tasks
DROP POLICY IF EXISTS "anon_select_tasks" ON tasks;
CREATE POLICY "anon_select_tasks" ON tasks FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_tasks" ON tasks;
CREATE POLICY "anon_insert_tasks" ON tasks FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_tasks" ON tasks;
CREATE POLICY "anon_update_tasks" ON tasks FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_tasks" ON tasks;
CREATE POLICY "anon_delete_tasks" ON tasks FOR DELETE TO anon, authenticated USING (true);

-- proposals
DROP POLICY IF EXISTS "anon_select_proposals" ON proposals;
CREATE POLICY "anon_select_proposals" ON proposals FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_proposals" ON proposals;
CREATE POLICY "anon_insert_proposals" ON proposals FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_proposals" ON proposals;
CREATE POLICY "anon_update_proposals" ON proposals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_proposals" ON proposals;
CREATE POLICY "anon_delete_proposals" ON proposals FOR DELETE TO anon, authenticated USING (true);

-- reminders
DROP POLICY IF EXISTS "anon_select_reminders" ON reminders;
CREATE POLICY "anon_select_reminders" ON reminders FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_reminders" ON reminders;
CREATE POLICY "anon_insert_reminders" ON reminders FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_reminders" ON reminders;
CREATE POLICY "anon_update_reminders" ON reminders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_reminders" ON reminders;
CREATE POLICY "anon_delete_reminders" ON reminders FOR DELETE TO anon, authenticated USING (true);

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customers_touch ON customers;
CREATE TRIGGER trg_customers_touch BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_properties_touch ON properties;
CREATE TRIGGER trg_properties_touch BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_visits_touch ON visits;
CREATE TRIGGER trg_visits_touch BEFORE UPDATE ON visits
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
