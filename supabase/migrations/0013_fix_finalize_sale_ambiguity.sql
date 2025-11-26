-- Fix finalize_sale function ambiguity by dropping old versions
-- Keep only the complete version with GCash support

-- Drop old function versions that cause ambiguity
DROP FUNCTION IF EXISTS finalize_sale(UUID, JSONB);
DROP FUNCTION IF EXISTS finalize_sale(UUID, JSONB, TEXT);

-- The complete version with GCash support (from 0010_update_finalize_sale_gcash.sql)
-- is already in place and will remain as the single version


