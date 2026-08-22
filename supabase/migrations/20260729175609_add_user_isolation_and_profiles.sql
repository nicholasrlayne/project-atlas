/*
# Multi-user data isolation + profiles table

1. Purpose
This migration converts Atlas from a single-tenant (no-auth) app to a
multi-user app where every row is scoped to the authenticated user who
created it. It also introduces a `profiles` table for onboarding data
(full name, business name, summary email).

AUTH METHOD NOTE (TEMPORARY):
The app currently uses Supabase email magic-link authentication as a
placeholder to avoid Twilio costs during testing. Phone OTP is the
intended long-term auth method. The auth method is abstracted behind
a "user is authenticated with a user_id" boundary — the RLS policies,
profiles table, and all downstream app code reference `auth.uid()` and
do not know or care which auth method produced the session. Swapping
magic links for phone OTP later will NOT require changes to anything
below this boundary.

2. Data Clearing
All existing test/seed data is deleted because it was created without
any user association during development. It cannot be retroactively
assigned to a real account.

3. New Tables
- `profiles` — onboarding data, one row per authenticated user.
  - user_id (uuid, PK, FK -> auth.users ON DELETE CASCADE)
  - full_name (text, NOT NULL)
  - business_name (text, NOT NULL)
  - summary_email (text, nullable — optional routing address for visit summaries)
  - created_at, updated_at

4. Modified Tables (all get user_id column added)
- `customers` — added user_id uuid NOT NULL DEFAULT auth.uid()
- `properties` — added user_id uuid NOT NULL DEFAULT auth.uid()
- `visits` — added user_id uuid NOT NULL DEFAULT auth.uid()
- `voice_recordings` — added user_id uuid NOT NULL DEFAULT auth.uid()
- `typed_entries` — added user_id uuid NOT NULL DEFAULT auth.uid()
- `photos` — added user_id uuid NOT NULL DEFAULT auth.uid()
- `tasks` — added user_id uuid NOT NULL DEFAULT auth.uid()
- `proposals` — added user_id uuid NOT NULL DEFAULT auth.uid()
- `reminders` — added user_id uuid NOT NULL DEFAULT auth.uid()

5. Security (RLS)
- RLS was already enabled on all existing tables; stays enabled.
- RLS enabled on `profiles`.
- ALL old anon-scoped policies are DROPPED and replaced with
  authenticated-owner-scoped policies (4 per table: SELECT, INSERT,
  UPDATE, DELETE) using `auth.uid() = user_id`.
- profiles uses `auth.uid() = user_id` (user_id is the PK).
- The DEFAULT auth.uid() on user_id columns means client-side inserts
  that omit user_id still satisfy the INSERT WITH CHECK policy.

6. Indexes
- Added index on user_id for each table for query performance.

7. Important Notes
  1. The extract-visit Edge Function uses the service role key which
     bypasses RLS. It must explicitly fetch the visit's user_id and
     write it onto every tasks/proposals row it inserts — RLS will not
     catch a missing user_id there.
  2. Swapping magic-link auth for phone OTP later only requires changing
     the auth UI code — nothing downstream of "authenticated user_id"
     needs to change.
*/

-- ============================================================
-- STEP 1: Clear all existing test data (no user association)
-- ============================================================
DELETE FROM reminders;
DELETE FROM proposals;
DELETE FROM tasks;
DELETE FROM photos;
DELETE FROM typed_entries;
DELETE FROM voice_recordings;
DELETE FROM visits;
DELETE FROM properties;
DELETE FROM customers;

-- ============================================================
-- STEP 2: Create profiles table
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  business_name text NOT NULL,
  summary_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- profiles RLS: owner can CRUD their own profile row
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- updated_at trigger for profiles
DROP TRIGGER IF EXISTS trg_profiles_touch ON profiles;
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- STEP 3: Add user_id column to all existing tables
-- ============================================================

-- customers
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'user_id') THEN
    ALTER TABLE customers ADD COLUMN user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- properties
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'user_id') THEN
    ALTER TABLE properties ADD COLUMN user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- visits
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'visits' AND column_name = 'user_id') THEN
    ALTER TABLE visits ADD COLUMN user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- voice_recordings
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'voice_recordings' AND column_name = 'user_id') THEN
    ALTER TABLE voice_recordings ADD COLUMN user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- typed_entries
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'typed_entries' AND column_name = 'user_id') THEN
    ALTER TABLE typed_entries ADD COLUMN user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- photos
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos' AND column_name = 'user_id') THEN
    ALTER TABLE photos ADD COLUMN user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- tasks
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'user_id') THEN
    ALTER TABLE tasks ADD COLUMN user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- proposals
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'user_id') THEN
    ALTER TABLE proposals ADD COLUMN user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- reminders
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reminders' AND column_name = 'user_id') THEN
    ALTER TABLE reminders ADD COLUMN user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- STEP 4: Indexes on user_id for query performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_properties_user ON properties(user_id);
CREATE INDEX IF NOT EXISTS idx_visits_user ON visits(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_recordings_user ON voice_recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_typed_entries_user ON typed_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_user ON photos(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_proposals_user ON proposals(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);

-- ============================================================
-- STEP 5: Replace all anon-scoped policies with owner-scoped policies
-- ============================================================

-- ---- customers ----
DROP POLICY IF EXISTS "anon_select_customers" ON customers;
DROP POLICY IF EXISTS "anon_insert_customers" ON customers;
DROP POLICY IF EXISTS "anon_update_customers" ON customers;
DROP POLICY IF EXISTS "anon_delete_customers" ON customers;

DROP POLICY IF EXISTS "select_own_customers" ON customers;
CREATE POLICY "select_own_customers" ON customers FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_customers" ON customers;
CREATE POLICY "insert_own_customers" ON customers FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_customers" ON customers;
CREATE POLICY "update_own_customers" ON customers FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_customers" ON customers;
CREATE POLICY "delete_own_customers" ON customers FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ---- properties ----
DROP POLICY IF EXISTS "anon_select_properties" ON properties;
DROP POLICY IF EXISTS "anon_insert_properties" ON properties;
DROP POLICY IF EXISTS "anon_update_properties" ON properties;
DROP POLICY IF EXISTS "anon_delete_properties" ON properties;

DROP POLICY IF EXISTS "select_own_properties" ON properties;
CREATE POLICY "select_own_properties" ON properties FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_properties" ON properties;
CREATE POLICY "insert_own_properties" ON properties FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_properties" ON properties;
CREATE POLICY "update_own_properties" ON properties FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_properties" ON properties;
CREATE POLICY "delete_own_properties" ON properties FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ---- visits ----
DROP POLICY IF EXISTS "anon_select_visits" ON visits;
DROP POLICY IF EXISTS "anon_insert_visits" ON visits;
DROP POLICY IF EXISTS "anon_update_visits" ON visits;
DROP POLICY IF EXISTS "anon_delete_visits" ON visits;

DROP POLICY IF EXISTS "select_own_visits" ON visits;
CREATE POLICY "select_own_visits" ON visits FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_visits" ON visits;
CREATE POLICY "insert_own_visits" ON visits FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_visits" ON visits;
CREATE POLICY "update_own_visits" ON visits FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_visits" ON visits;
CREATE POLICY "delete_own_visits" ON visits FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ---- voice_recordings ----
DROP POLICY IF EXISTS "anon_select_voice_recordings" ON voice_recordings;
DROP POLICY IF EXISTS "anon_insert_voice_recordings" ON voice_recordings;
DROP POLICY IF EXISTS "anon_update_voice_recordings" ON voice_recordings;
DROP POLICY IF EXISTS "anon_delete_voice_recordings" ON voice_recordings;

DROP POLICY IF EXISTS "select_own_voice_recordings" ON voice_recordings;
CREATE POLICY "select_own_voice_recordings" ON voice_recordings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_voice_recordings" ON voice_recordings;
CREATE POLICY "insert_own_voice_recordings" ON voice_recordings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_voice_recordings" ON voice_recordings;
CREATE POLICY "update_own_voice_recordings" ON voice_recordings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_voice_recordings" ON voice_recordings;
CREATE POLICY "delete_own_voice_recordings" ON voice_recordings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ---- typed_entries ----
DROP POLICY IF EXISTS "anon_select_typed_entries" ON typed_entries;
DROP POLICY IF EXISTS "anon_insert_typed_entries" ON typed_entries;
DROP POLICY IF EXISTS "anon_update_typed_entries" ON typed_entries;
DROP POLICY IF EXISTS "anon_delete_typed_entries" ON typed_entries;

DROP POLICY IF EXISTS "select_own_typed_entries" ON typed_entries;
CREATE POLICY "select_own_typed_entries" ON typed_entries FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_typed_entries" ON typed_entries;
CREATE POLICY "insert_own_typed_entries" ON typed_entries FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_typed_entries" ON typed_entries;
CREATE POLICY "update_own_typed_entries" ON typed_entries FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_typed_entries" ON typed_entries;
CREATE POLICY "delete_own_typed_entries" ON typed_entries FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ---- photos ----
DROP POLICY IF EXISTS "anon_select_photos" ON photos;
DROP POLICY IF EXISTS "anon_insert_photos" ON photos;
DROP POLICY IF EXISTS "anon_update_photos" ON photos;
DROP POLICY IF EXISTS "anon_delete_photos" ON photos;

DROP POLICY IF EXISTS "select_own_photos" ON photos;
CREATE POLICY "select_own_photos" ON photos FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_photos" ON photos;
CREATE POLICY "insert_own_photos" ON photos FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_photos" ON photos;
CREATE POLICY "update_own_photos" ON photos FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_photos" ON photos;
CREATE POLICY "delete_own_photos" ON photos FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ---- tasks ----
DROP POLICY IF EXISTS "anon_select_tasks" ON tasks;
DROP POLICY IF EXISTS "anon_insert_tasks" ON tasks;
DROP POLICY IF EXISTS "anon_update_tasks" ON tasks;
DROP POLICY IF EXISTS "anon_delete_tasks" ON tasks;

DROP POLICY IF EXISTS "select_own_tasks" ON tasks;
CREATE POLICY "select_own_tasks" ON tasks FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_tasks" ON tasks;
CREATE POLICY "insert_own_tasks" ON tasks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_tasks" ON tasks;
CREATE POLICY "update_own_tasks" ON tasks FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_tasks" ON tasks;
CREATE POLICY "delete_own_tasks" ON tasks FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ---- proposals ----
DROP POLICY IF EXISTS "anon_select_proposals" ON proposals;
DROP POLICY IF EXISTS "anon_insert_proposals" ON proposals;
DROP POLICY IF EXISTS "anon_update_proposals" ON proposals;
DROP POLICY IF EXISTS "anon_delete_proposals" ON proposals;

DROP POLICY IF EXISTS "select_own_proposals" ON proposals;
CREATE POLICY "select_own_proposals" ON proposals FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_proposals" ON proposals;
CREATE POLICY "insert_own_proposals" ON proposals FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_proposals" ON proposals;
CREATE POLICY "update_own_proposals" ON proposals FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_proposals" ON proposals;
CREATE POLICY "delete_own_proposals" ON proposals FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ---- reminders ----
DROP POLICY IF EXISTS "anon_select_reminders" ON reminders;
DROP POLICY IF EXISTS "anon_insert_reminders" ON reminders;
DROP POLICY IF EXISTS "anon_update_reminders" ON reminders;
DROP POLICY IF EXISTS "anon_delete_reminders" ON reminders;

DROP POLICY IF EXISTS "select_own_reminders" ON reminders;
CREATE POLICY "select_own_reminders" ON reminders FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_reminders" ON reminders;
CREATE POLICY "insert_own_reminders" ON reminders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_reminders" ON reminders;
CREATE POLICY "update_own_reminders" ON reminders FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_reminders" ON reminders;
CREATE POLICY "delete_own_reminders" ON reminders FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
