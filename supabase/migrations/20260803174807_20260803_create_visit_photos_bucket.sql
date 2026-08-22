/*
# Create visit-photos storage bucket with RLS

1. Purpose
Stores photo images captured during active visits. Private bucket —
objects are only accessible via signed URLs generated with the service
role or through RLS-scoped access.

2. Storage
- Bucket: `visit-photos` (private, not public)
- Path convention: {user_id}/{visit_id}/{filename}

3. Security (Storage RLS policies)
- SELECT: users can read objects whose path starts with their own user_id
- INSERT: users can upload objects under their own user_id path
- UPDATE: users can update objects under their own user_id path
- DELETE: users can delete objects under their own user_id path
- All policies use (storage.foldername(name))[1] to extract the user_id
  segment from the object path
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('visit-photos', 'visit-photos', false)
ON CONFLICT (id) DO NOTHING;

-- SELECT: owner can read their own photos
DROP POLICY IF EXISTS "read_own_photos" ON storage.objects;
CREATE POLICY "read_own_photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'visit-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- INSERT: owner can upload to their own path
DROP POLICY IF EXISTS "insert_own_photos" ON storage.objects;
CREATE POLICY "insert_own_photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'visit-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- UPDATE: owner can update their own photos
DROP POLICY IF EXISTS "update_own_photos" ON storage.objects;
CREATE POLICY "update_own_photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'visit-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'visit-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- DELETE: owner can delete their own photos
DROP POLICY IF EXISTS "delete_own_photos" ON storage.objects;
CREATE POLICY "delete_own_photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'visit-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
