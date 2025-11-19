'use server'

import { createServerClient } from '@/lib/supabase/server'

export async function runGCashMigrations() {
  const supabase = createServerClient()

  try {
    // Read the migration SQL file content
    // Since we can't read files directly in server actions, we'll embed the SQL
    const migrationSQL = `
-- Migration 0009: Add GCash transaction fields
ALTER TABLE sales 
  ADD COLUMN IF NOT EXISTS gcash_reference_code TEXT,
  ADD COLUMN IF NOT EXISTS gcash_transaction_timestamp_utc TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gcash_image_url TEXT,
  ADD COLUMN IF NOT EXISTS gcash_verified_at_utc TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gcash_verification_status TEXT CHECK (gcash_verification_status IN ('confirmed', 'rejected', NULL)),
  ADD COLUMN IF NOT EXISTS gcash_rejection_reason TEXT CHECK (gcash_rejection_reason IN ('ocr_failed', 'not_gcash', 'missing_datetime', 'missing_reference', 'too_old', 'duplicate_reference', NULL));

-- Update payment_method constraint
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_payment_method_check') THEN
    ALTER TABLE sales DROP CONSTRAINT sales_payment_method_check;
  END IF;
END $$;

ALTER TABLE sales 
  ADD CONSTRAINT sales_payment_method_check 
  CHECK (payment_method IN ('cash', 'card', 'gcash'));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sales_gcash_reference_code ON sales(gcash_reference_code) 
  WHERE gcash_reference_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_gcash_verification_status ON sales(gcash_verification_status) 
  WHERE gcash_verification_status IS NOT NULL;
`

    // Note: Supabase JS client doesn't support executing arbitrary SQL
    // We need to use the REST API or direct PostgreSQL connection
    // For now, return instructions
    
    return {
      success: false,
      error: 'Direct SQL execution not available via Supabase JS client. Please use SQL Editor.',
      instructions: 'Please run the migrations manually in Supabase SQL Editor.'
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      instructions: 'Please run the migrations manually in Supabase SQL Editor.'
    }
  }
}



