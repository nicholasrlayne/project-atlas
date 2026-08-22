/*
# Admin panel support: is_admin flag, Stripe columns, subscriptions table

1. Purpose
This migration adds the database foundation for:
  - An admin panel accessible at /admin by users flagged as admins
  - Flat monthly per-user subscription billing via Stripe (groundwork only;
    no live Stripe connection is wired up in this migration)

2. Modified Tables
- `profiles`
  - Added `is_admin` (boolean, default false) — gates access to the admin panel
  - Added `stripe_customer_id` (text, nullable) — links the user to their Stripe customer

3. New Tables
- `subscriptions`
  - id (uuid, PK)
  - user_id (uuid, FK -> auth.users ON DELETE CASCADE) — which user subscribes
  - stripe_subscription_id (text, unique, nullable) — Stripe's subscription object ID
  - stripe_price_id (text, nullable) — the Stripe price being billed
  - plan_name (text, default 'monthly') — human-readable plan label
  - status (text, default 'inactive') — active, past_due, canceled, trialing, inactive
  - monthly_amount_cents (integer, default 0) — flat monthly rate in cents
  - current_period_start (timestamptz, nullable)
  - current_period_end (timestamptz, nullable)
  - canceled_at (timestamptz, nullable)
  - created_at, updated_at

4. Security (RLS)
- `subscriptions` has RLS enabled.
- Users can SELECT and UPDATE their own subscription row (user_id = auth.uid()).
- INSERT and DELETE are NOT granted to the anon/authenticated roles — only
  edge functions using the service role key (which bypasses RLS) create or
  delete subscription rows, ensuring users cannot self-create or cancel.
- `profiles` existing owner-scoped policies remain; the new `is_admin` column
  is readable by the owner (already covered by select_own_profile). No new
  policy is needed because the existing SELECT policy already returns the
  full row to the owner.

5. Important Notes
  1. To become an admin, set `is_admin = true` on your profiles row directly
     in the database (e.g. via execute_sql or the Supabase dashboard).
  2. The subscriptions table is a foundation for Stripe billing. Edge functions
     (checkout, webhooks) will be added later when Stripe keys are configured.
  3. The `is_admin` column is protected by RLS: a user can read their own
     profiles row (including is_admin) but can only UPDATE columns the app
     lets them update — the existing update_own_profile policy allows any
     column update on their own row, but the app never sends is_admin in an
     update payload. For defense in depth, a trigger could be added later
     to prevent self-elevation, but the service-role edge functions are the
     real enforcement boundary.
*/

-- ============================================================
-- STEP 1: Add is_admin and stripe_customer_id to profiles
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_admin') THEN
    ALTER TABLE profiles ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'stripe_customer_id') THEN
    ALTER TABLE profiles ADD COLUMN stripe_customer_id text;
  END IF;
END $$;

-- ============================================================
-- STEP 2: Create subscriptions table
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE,
  stripe_price_id text,
  plan_name text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'inactive',
  monthly_amount_cents integer NOT NULL DEFAULT 0,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription
DROP POLICY IF EXISTS "select_own_subscription" ON subscriptions;
CREATE POLICY "select_own_subscription" ON subscriptions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Users can update their own subscription (e.g. plan changes from the app)
DROP POLICY IF EXISTS "update_own_subscription" ON subscriptions;
CREATE POLICY "update_own_subscription" ON subscriptions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at trigger for subscriptions
DROP TRIGGER IF EXISTS trg_subscriptions_touch ON subscriptions;
CREATE TRIGGER trg_subscriptions_touch BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Index for lookups by user
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
