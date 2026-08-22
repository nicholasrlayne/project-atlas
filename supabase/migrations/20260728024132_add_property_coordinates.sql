/*
# Add GPS coordinates to properties table

1. Purpose
The customer/property identification flow uses GPS to match the owner's
current location against saved properties. Properties need latitude/longitude
columns to support this matching.

2. Modified Tables
- `properties`
  - New column: `latitude` (double precision, nullable)
  - New column: `longitude` (double precision, nullable)
  Nullable because existing properties and manually-created properties may
  not have coordinates. The GPS match flow simply skips properties without
  coordinates.

3. Security
- No RLS changes. Existing anon/authenticated CRUD policies already cover
  the new columns.
*/

ALTER TABLE properties ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS longitude double precision;
