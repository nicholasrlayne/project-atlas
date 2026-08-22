/*
# Create projects table + add project_id to visits

1. Purpose
This migration introduces a `projects` table so an owner can manually
group visits into a project for a customer. Nothing auto-creates
projects yet — that detection logic is a separate, later phase. This
pass only builds the data model and the manual entry point.

2. New Tables
- `projects`
  - id (uuid, PK, gen_random_uuid())
  - customer_id (uuid, FK -> customers ON DELETE CASCADE, NOT NULL)
  - user_id (uuid, FK -> auth.users ON DELETE CASCADE, NOT NULL,
    DEFAULT auth.uid() — owner isolation, same pattern as all other tables)
  - name (text, NOT NULL)
  - created_at (timestamptz, DEFAULT now())

3. Modified Tables
- `visits` — added nullable `project_id` (uuid, FK -> projects ON DELETE
  SET NULL). Nullable because existing visits and future visits with no
  project must continue to work exactly as they do today.

4. Security (RLS)
- RLS enabled on `projects`.
- 4 owner-scoped policies (SELECT/INSERT/UPDATE/DELETE) using
  auth.uid() = user_id — identical pattern to every other table.
- DEFAULT auth.uid() on user_id so inserts omitting user_id still pass
  the INSERT WITH CHECK policy.
- visits already has owner-scoped RLS; project_id is just a column.

5. Indexes
- idx_projects_customer on (customer_id)
- idx_projects_user on (user_id)
- idx_visits_project on visits(project_id) — for grouping queries

6. Important Notes
  1. project_id on visits is nullable and defaults to NULL — all
     existing visits and the entire no-project flow are unaffected.
  2. ON DELETE SET NULL on visits.project_id means deleting a project
     ungroups its visits (they become standalone again), rather than
     losing the visit data.
*/

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_projects" ON projects;
CREATE POLICY "select_own_projects" ON projects FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_projects" ON projects;
CREATE POLICY "insert_own_projects" ON projects FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_projects" ON projects;
CREATE POLICY "update_own_projects" ON projects FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_projects" ON projects;
CREATE POLICY "delete_own_projects" ON projects FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'visits' AND column_name = 'project_id') THEN
    ALTER TABLE visits ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_visits_project ON visits(project_id);
