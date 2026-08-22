/*
# Clear all demo / seed data from the database

1. Purpose
Remove all seeded demo data (Riverside Apartments, Westgate Plaza, and all
linked rows) so the app starts from a genuinely empty state. This also
removes any test visits created during development (orphan visits with no
customer/property links).

2. Deletion order (children before parents to respect FK constraints)
   a. tasks            — FK -> visits
   b. photos           — FK -> visits
   c. proposals        — FK -> visits
   d. voice_recordings — FK -> visits
   e. typed_entries    — FK -> visits
   f. reminders        — FK -> customers (nullable, no cascade)
   g. visits           — FK -> customers, properties (SET NULL)
   h. properties       — FK -> customers (CASCADE)
   i. customers        — parent table

3. Security
   - No schema or RLS changes. Only DML deletes.
   - This migration is safe to re-run: deleting from an empty table is a no-op.

4. Notes
   - The original seed script is preserved at:
     supabase/seed_demo_data.sql
   - It is NOT run automatically on app load. Run it manually via
     mcp__supabase__execute_sql when you want demo data again.
*/

DELETE FROM tasks;
DELETE FROM photos;
DELETE FROM proposals;
DELETE FROM voice_recordings;
DELETE FROM typed_entries;
DELETE FROM reminders;
DELETE FROM visits;
DELETE FROM properties;
DELETE FROM customers;
