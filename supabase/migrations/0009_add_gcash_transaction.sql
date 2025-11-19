-- Add GCash transaction fields to sales table
ALTER TABLE sales 
  ADD COLUMN IF NOT EXISTS gcash_reference_code TEXT,
  ADD COLUMN IF NOT EXISTS gcash_transaction_timestamp_utc TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gcash_image_url TEXT,
  ADD COLUMN IF NOT EXISTS gcash_verified_at_utc TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gcash_verification_status TEXT CHECK (gcash_verification_status IN ('confirmed', 'rejected', NULL)),
  ADD COLUMN IF NOT EXISTS gcash_rejection_reason TEXT CHECK (gcash_rejection_reason IN ('ocr_failed', 'not_gcash', 'missing_datetime', 'missing_reference', 'too_old', 'duplicate_reference', NULL));

-- Update payment_method constraint to include 'gcash'
ALTER TABLE sales 
  DROP CONSTRAINT IF EXISTS sales_payment_method_check;
  
ALTER TABLE sales 
  ADD CONSTRAINT sales_payment_method_check 
  CHECK (payment_method IN ('cash', 'card', 'gcash'));

-- Create index for GCash reference codes (for duplicate detection)
CREATE INDEX IF NOT EXISTS idx_sales_gcash_reference_code ON sales(gcash_reference_code) 
  WHERE gcash_reference_code IS NOT NULL;

-- Create index for GCash verification status
CREATE INDEX IF NOT EXISTS idx_sales_gcash_verification_status ON sales(gcash_verification_status) 
  WHERE gcash_verification_status IS NOT NULL;



