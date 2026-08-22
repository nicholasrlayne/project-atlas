/*
# Seed: Riverside Apartments demo data

This is a LOCAL TESTING seed script. It inserts demo customers, properties,
a visit, voice recordings, tasks, a proposal, and reminders so the app has
sample data during development.

This script is NOT run automatically on app load. Run it manually via the
Supabase MCP execute_sql tool when you want demo data:

    mcp__supabase__execute_sql({ query: "<contents of this file>" })

To clear the data afterward, use the migration:
`20260728020000_clear_demo_data.sql`.

1. Data inserted (uses fixed UUIDs so it is re-runnable / idempotent):
   - Customer: Riverside Apartments (c1a00000-...)
   - Customer: Westgate Plaza (c2a00000-...)
   - Property: Bldg C — 120 Riverside Dr (1a000000-...)
   - Property: Main Lot — 450 Westgate Blvd (2a000000-...)
   - Visit: Dryer vent service at Bldg C (3a000000-...)
   - Voice recording: lint buildup transcript
   - Tasks: Replace roof cap, Send quarterly pricing, Log lint volume photo
   - Proposal: Quarterly vent service — $340/qtr
   - Reminders: Westgate Plaza follow-up (high), ABC Apartments irrigation (normal)

2. Security
   - No schema or RLS changes. All inserts respect existing policies.
*/

-- Customers
INSERT INTO customers (id, name, contact_name, contact_email, contact_phone, notes)
VALUES (
  'c1a00000-0000-0000-0000-000000000001',
  'Riverside Apartments',
  'Dana Whitfield',
  NULL,
  '(555) 204-1180',
  'Multi-building complex, dryer vent service quarterly.'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO customers (id, name, contact_name, contact_email, contact_phone, notes)
VALUES (
  'c2a00000-0000-0000-0000-000000000002',
  'Westgate Plaza',
  'Marcus Lee',
  NULL,
  '(555) 778-2042',
  'Retail plaza, annual pest control renewal pending.'
) ON CONFLICT (id) DO NOTHING;

-- Properties
INSERT INTO properties (id, customer_id, name, address, notes)
VALUES (
  '1a000000-0000-0000-0000-000000000001',
  'c1a00000-0000-0000-0000-000000000001',
  'Bldg C',
  '120 Riverside Dr',
  NULL
) ON CONFLICT (id) DO NOTHING;

INSERT INTO properties (id, customer_id, name, address, notes)
VALUES (
  '2a000000-0000-0000-0000-000000000002',
  'c2a00000-0000-0000-0000-000000000002',
  'Main Lot',
  '450 Westgate Blvd',
  NULL
) ON CONFLICT (id) DO NOTHING;

-- Visit (linked to Riverside Apartments / Bldg C)
INSERT INTO visits (id, customer_id, property_id, service_type, status, started_at, summary)
VALUES (
  '3a000000-0000-0000-0000-000000000001',
  'c1a00000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-000000000001',
  'dryer_vent_cleaning',
  'summarized',
  '2026-07-27 14:00:00+00',
  'Cleared heavy lint buildup near the roof cap on Bldg C. Customer asked about moving from annual to quarterly service given the buildup rate. No damage to ductwork observed.'
) ON CONFLICT (id) DO NOTHING;

-- Voice recording
INSERT INTO voice_recordings (visit_id, transcript, duration_sec)
VALUES (
  '3a000000-0000-0000-0000-000000000001',
  'vent has heavy lint buildup near the roof cap, customer mentioned wanting to move to quarterly service instead of annual',
  47
) ON CONFLICT DO NOTHING;

-- Tasks
INSERT INTO tasks (id, visit_id, title, due_context, status)
VALUES
  ('ae4e876a-abbe-4c77-b521-efbfbbf6e58e', '3a000000-0000-0000-0000-000000000001', 'Replace roof cap', 'Due next visit', 'open'),
  ('223aaca5-5b5f-471b-b013-f1a3a0c6cc88', '3a000000-0000-0000-0000-000000000001', 'Send quarterly service pricing', 'This week', 'open'),
  ('01766de8-ca15-48ff-b301-f3aa4529a6fc', '3a000000-0000-0000-0000-000000000001', 'Log lint volume photo', 'Attached', 'open')
ON CONFLICT (id) DO NOTHING;

-- Proposal
INSERT INTO proposals (id, visit_id, title, price_text, description, status)
VALUES (
  'bb871078-f5f4-47f9-a5eb-cd25d89709a1',
  '3a000000-0000-0000-0000-000000000001',
  'Quarterly vent service',
  '$340/qtr',
  'Based on 3 prior visits and current buildup rate at this property.',
  'draft'
) ON CONFLICT (id) DO NOTHING;

-- Reminders
INSERT INTO reminders (id, customer_id, title, detail, urgency, done, due_date)
VALUES
  ('4a000000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000002', 'Westgate Plaza', 'Proposal follow-up · 9 days overdue', 'high', false, '2026-07-18'),
  ('5a000000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000001', 'ABC Apartments', 'Irrigation check due this week', 'normal', false, '2026-07-30')
ON CONFLICT (id) DO NOTHING;
