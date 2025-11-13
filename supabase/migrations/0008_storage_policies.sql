-- Storage RLS Policies for product-images bucket
-- These policies allow public read access and authenticated/anonymous uploads

-- Policy to allow public read access to product-images bucket
CREATE POLICY "Public Access for product-images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'product-images');

-- Policy to allow anyone to upload to product-images bucket
CREATE POLICY "Allow uploads to product-images"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'product-images');

-- Policy to allow updates to files in product-images bucket
CREATE POLICY "Allow updates to product-images"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'product-images');

-- Policy to allow deletes from product-images bucket
CREATE POLICY "Allow deletes from product-images"
ON storage.objects
FOR DELETE
USING (bucket_id = 'product-images');
