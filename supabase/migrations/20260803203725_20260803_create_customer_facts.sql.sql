/*
# Create customer_facts table

1. Purpose
Durable relationship intelligence per customer — decision makers, process
notes, renewal timing, upsell opportunities. Captured automatically during
visit extraction and editable manually. Surfaced on Customer Detail.

2. Modified Tables
- New table `customer_facts`

3. Security
- RLS enabled, owner-scoped via auth.uid() = user_id (same as all other tables).
*/

CREATE TABLE IF NOT EXISTS customer_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('decision_maker', 'process', 'renewal_timing', 'upsell_opportunity')),
  value text NOT NULL,
  source_visit_id uuid REFERENCES visits(id) ON DELETE SET NULL,
  is_manual boolean NOT NULL DEFAULT false,
  previous_value text,
  acknowledged boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_facts_customer ON customer_facts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_facts_user ON customer_facts(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_facts_type ON customer_facts(customer_id, type);

ALTER TABLE customer_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select_customer_facts" ON customer_facts;
CREATE POLICY "own_select_customer_facts" ON customer_facts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_insert_customer_facts" ON customer_facts;
CREATE POLICY "own_insert_customer_facts" ON customer_facts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_update_customer_facts" ON customer_facts;
CREATE POLICY "own_update_customer_facts" ON customer_facts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_delete_customer_facts" ON customer_facts;
CREATE POLICY "own_delete_customer_facts" ON customer_facts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_customer_facts_touch ON customer_facts;
CREATE TRIGGER trg_customer_facts_touch BEFORE UPDATE ON customer_facts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
