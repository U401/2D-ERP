-- Note: This migration creates storage policies for the gcash-transactions bucket
-- The bucket itself should be created manually in Supabase Dashboard or via the storage API
-- This bucket should be PRIVATE (not public) for security

-- Policy to allow authenticated/admin users to upload GCash transaction images
CREATE POLICY "Allow uploads to gcash-transactions"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'gcash-transactions');

-- Policy to allow authenticated/admin users to read GCash transaction images
CREATE POLICY "Allow reads from gcash-transactions"
ON storage.objects
FOR SELECT
USING (bucket_id = 'gcash-transactions');

-- Policy to allow authenticated/admin users to update GCash transaction images
CREATE POLICY "Allow updates to gcash-transactions"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'gcash-transactions');

-- Policy to allow authenticated/admin users to delete GCash transaction images
CREATE POLICY "Allow deletes from gcash-transactions"
ON storage.objects
FOR DELETE
USING (bucket_id = 'gcash-transactions');



