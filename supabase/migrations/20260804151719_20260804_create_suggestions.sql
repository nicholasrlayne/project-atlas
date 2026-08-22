/*
# Create suggestions table (generic infra)

1. Purpose
This migration introduces a generic `suggestions` table that Atlas uses
to surface actionable recommendations to the user (e.g. "group these
visits into a project"). Nothing populates this table yet — that logic
(project-grouping detection) is a separate, later build. The table and
its API are designed to be type-agnostic so new suggestion types can be
added without schema changes.

2. New Tables
- `suggestions`
  - id (uuid, PK, gen_random_uuid())
  - customer_id (uuid, FK -> customers ON DELETE CASCADE, NOT NULL)
  - user_id (uuid, FK -> auth.users ON DELETE CASCADE, NOT NULL,
    DEFAULT auth.uid() — owner isolation, same pattern as all other tables)
  - type (text, NOT NULL — no CHECK constraint; values are open-ended.
    First type: 'group_into_project'. Future types added without migration.)
  - payload (jsonb, nullable — shape depends on `type`. For
    'group_into_project' this will eventually hold candidate visit IDs.)
  - status (text, NOT NULL, CHECK: 'pending' | 'accepted' | 'dismissed',
    DEFAULT 'pending')
  - created_at (timestamptz, DEFAULT now())

3. Security (RLS)
- RLS enabled on `suggestions`.
- 4 owner-scoped policies (SELECT/INSERT/UPDATE/DELETE) using
  auth.uid() = user_id — identical pattern to every other table.
- DEFAULT auth.uid() on user_id so inserts omitting user_id still pass
  the INSERT WITH CHECK policy.

4. Indexes
- idx_suggestions_user on (user_id)
- idx_suggestions_status on (status) — pending queries are the hot path

5. Important Notes
  1. No CHECK constraint on `type` — intentional. New suggestion types
     will be added in code without requiring a migration.
  2. Nothing writes to this table in this pass. fetchPendingSuggestions()
     will return an empty array — that is expected, not a bug.
*/

CREATE TABLE IF NOT EXISTS suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_suggestions" ON suggestions;
CREATE POLICY "select_own_suggestions" ON suggestions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_suggestions" ON suggestions;
CREATE POLICY "insert_own_suggestions" ON suggestions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_suggestions" ON suggestions;
CREATE POLICY "update_own_suggestions" ON suggestions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_suggestions" ON suggestions;
CREATE POLICY "delete_own_suggestions" ON suggestions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_suggestions_user ON suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
