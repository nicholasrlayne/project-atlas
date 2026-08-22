-- ============================================================
-- Atlas full schema rebuild
-- Runs in dependency order: enums/functions → tables → FKs → RLS → triggers → indexes → storage
-- Safe to run on an empty database.
-- ============================================================

-- ── Shared updated_at function ────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============================================================
-- TABLE: profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     text NOT NULL,
  business_name text NOT NULL,
  summary_email text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_delete_own" ON profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE TRIGGER trg_profiles_touch
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- TABLE: customers
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  contact_name  text,
  contact_email text,
  contact_phone text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select_own" ON customers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "customers_insert_own" ON customers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "customers_update_own" ON customers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "customers_delete_own" ON customers FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE TRIGGER trg_customers_touch
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- TABLE: properties
-- ============================================================
CREATE TABLE IF NOT EXISTS properties (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text,
  address     text,
  latitude    numeric,
  longitude   numeric,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_properties_user     ON properties(user_id);
CREATE INDEX IF NOT EXISTS idx_properties_customer ON properties(customer_id);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "properties_select_own" ON properties FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "properties_insert_own" ON properties FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "properties_update_own" ON properties FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "properties_delete_own" ON properties FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE TRIGGER trg_properties_touch
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- TABLE: projects
-- (must come before visits because visits.project_id FK references it)
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_user     ON projects(user_id);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_select_own" ON projects FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "projects_insert_own" ON projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "projects_update_own" ON projects FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "projects_delete_own" ON projects FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- TABLE: visits
-- ============================================================
CREATE TABLE IF NOT EXISTS visits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid REFERENCES customers(id) ON DELETE SET NULL,
  property_id  uuid REFERENCES properties(id) ON DELETE SET NULL,
  project_id   uuid REFERENCES projects(id) ON DELETE SET NULL,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_type text CHECK (service_type IN ('landscaping','pest_control','irrigation','dryer_vent_cleaning','pressure_washing','general')),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','summarized','saved')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  ended_at     timestamptz,
  summary      text,
  edited       boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visits_user     ON visits(user_id);
CREATE INDEX IF NOT EXISTS idx_visits_customer ON visits(customer_id);
CREATE INDEX IF NOT EXISTS idx_visits_property ON visits(property_id);
CREATE INDEX IF NOT EXISTS idx_visits_status   ON visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_project  ON visits(project_id);

ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visits_select_own" ON visits FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "visits_insert_own" ON visits FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "visits_update_own" ON visits FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "visits_delete_own" ON visits FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE TRIGGER trg_visits_touch
  BEFORE UPDATE ON visits
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- TABLE: voice_recordings
-- ============================================================
CREATE TABLE IF NOT EXISTS voice_recordings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id     uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transcript   text,
  duration_sec int,
  confidence   numeric,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_visit            ON voice_recordings(visit_id);
CREATE INDEX IF NOT EXISTS idx_voice_recordings_user  ON voice_recordings(user_id);

ALTER TABLE voice_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice_select_own"  ON voice_recordings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "voice_insert_own"  ON voice_recordings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "voice_update_own"  ON voice_recordings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "voice_delete_own"  ON voice_recordings FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- TABLE: typed_entries
-- ============================================================
CREATE TABLE IF NOT EXISTS typed_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id   uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_typed_visit         ON typed_entries(visit_id);
CREATE INDEX IF NOT EXISTS idx_typed_entries_user  ON typed_entries(user_id);

ALTER TABLE typed_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "typed_select_own"  ON typed_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "typed_insert_own"  ON typed_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "typed_update_own"  ON typed_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "typed_delete_own"  ON typed_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- TABLE: photos
-- ============================================================
CREATE TABLE IF NOT EXISTS photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id     uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text,
  caption      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photos_visit  ON photos(visit_id);
CREATE INDEX IF NOT EXISTS idx_photos_user   ON photos(user_id);

ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "photos_select_own"  ON photos FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "photos_insert_own"  ON photos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "photos_update_own"  ON photos FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "photos_delete_own"  ON photos FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- TABLE: tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id     uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        text NOT NULL,
  due_context  text,
  due_date     date,
  priority     text CHECK (priority IN ('low','medium','high')),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  edited       boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tasks_visit  ON tasks(visit_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user   ON tasks(user_id);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select_own"  ON tasks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "tasks_insert_own"  ON tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tasks_update_own"  ON tasks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tasks_delete_own"  ON tasks FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- TABLE: proposals
-- ============================================================
CREATE TABLE IF NOT EXISTS proposals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id       uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title          text,
  price_text     text,
  price_estimate numeric(10,2),
  description    text,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_visit  ON proposals(visit_id);
CREATE INDEX IF NOT EXISTS idx_proposals_user   ON proposals(user_id);

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proposals_select_own"  ON proposals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "proposals_insert_own"  ON proposals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "proposals_update_own"  ON proposals FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "proposals_delete_own"  ON proposals FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- TABLE: reminders
-- ============================================================
CREATE TABLE IF NOT EXISTS reminders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  detail      text,
  urgency     text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('high','normal')),
  done        boolean NOT NULL DEFAULT false,
  due_date    date,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_open ON reminders(done, due_date);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminders_select_own"  ON reminders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "reminders_insert_own"  ON reminders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reminders_update_own"  ON reminders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reminders_delete_own"  ON reminders FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- TABLE: customer_facts
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_facts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type           text NOT NULL CHECK (type IN ('decision_maker','process','renewal_timing','upsell_opportunity')),
  value          text NOT NULL,
  source_visit_id uuid REFERENCES visits(id) ON DELETE SET NULL,
  is_manual      boolean NOT NULL DEFAULT false,
  previous_value text,
  acknowledged   boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_facts_customer ON customer_facts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_facts_user     ON customer_facts(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_facts_type     ON customer_facts(customer_id, type);

ALTER TABLE customer_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_facts_select_own"  ON customer_facts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "customer_facts_insert_own"  ON customer_facts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "customer_facts_update_own"  ON customer_facts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "customer_facts_delete_own"  ON customer_facts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE TRIGGER trg_customer_facts_touch
  BEFORE UPDATE ON customer_facts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- TABLE: suggestions
-- ============================================================
CREATE TABLE IF NOT EXISTS suggestions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  type        text NOT NULL,
  payload     jsonb,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','dismissed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suggestions_user   ON suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);

ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suggestions_select_own"  ON suggestions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "suggestions_insert_own"  ON suggestions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "suggestions_update_own"  ON suggestions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "suggestions_delete_own"  ON suggestions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- TABLE: export_log
-- ============================================================
CREATE TABLE IF NOT EXISTS export_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visit_id       uuid REFERENCES visits(id) ON DELETE SET NULL,
  artifact_type  text NOT NULL,
  export_method  text NOT NULL,
  destination    text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_log_user  ON export_log(user_id);
CREATE INDEX IF NOT EXISTS idx_export_log_visit ON export_log(visit_id);

ALTER TABLE export_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "export_log_select_own"  ON export_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "export_log_insert_own"  ON export_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "export_log_update_own"  ON export_log FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "export_log_delete_own"  ON export_log FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- STORAGE: visit-photos bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'visit-photos',
  'visit-photos',
  false,
  10485760,    -- 10 MB per file
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can manage objects under their own user_id/ prefix.
CREATE POLICY "storage_visit_photos_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'visit-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "storage_visit_photos_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'visit-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "storage_visit_photos_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'visit-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "storage_visit_photos_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'visit-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
