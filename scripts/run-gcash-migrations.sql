-- Combined GCash Migration Script
-- Run this entire script in Supabase SQL Editor to set up GCash transaction detection

-- ============================================
-- Migration 0009: Add GCash transaction fields
-- ============================================
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

-- ============================================
-- Migration 0010: Update finalize_sale function
-- ============================================
CREATE OR REPLACE FUNCTION finalize_sale(
  p_session_id UUID,
  p_items JSONB,
  p_payment_method TEXT DEFAULT 'cash',
  p_gcash_reference_code TEXT DEFAULT NULL,
  p_gcash_transaction_timestamp_utc TIMESTAMPTZ DEFAULT NULL,
  p_gcash_image_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale_id UUID;
  v_total_amount NUMERIC := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INTEGER;
  v_unit_price NUMERIC;
  v_recipe_record RECORD;
  v_needed NUMERIC;
  v_available NUMERIC;
  v_batch_record RECORD;
  v_to_consume NUMERIC;
BEGIN
  -- Validate session is open
  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Session is not open or does not exist';
  END IF;

  -- Validate payment method
  IF p_payment_method NOT IN ('cash', 'card', 'gcash') THEN
    RAISE EXCEPTION 'Invalid payment method. Must be cash, card, or gcash';
  END IF;

  -- Validate GCash-specific fields if payment method is GCash
  IF p_payment_method = 'gcash' THEN
    IF p_gcash_reference_code IS NULL OR p_gcash_transaction_timestamp_utc IS NULL THEN
      RAISE EXCEPTION 'GCash payment requires reference code and transaction timestamp';
    END IF;
  END IF;

  -- Validate items array is not empty
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sale must contain at least one item';
  END IF;

  -- Calculate total amount
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_quantity := (v_item->>'quantity')::INTEGER;
    
    IF v_unit_price <= 0 THEN
      -- Fetch product price if not provided
      SELECT price INTO v_unit_price
      FROM products
      WHERE id = (v_item->>'product_id')::UUID;
      
      IF v_unit_price IS NULL THEN
        RAISE EXCEPTION 'Product not found: %', v_item->>'product_id';
      END IF;
    END IF;
    
    v_total_amount := v_total_amount + (v_unit_price * v_quantity);
  END LOOP;

  -- Create sale record with payment method and GCash data
  INSERT INTO sales (
    session_id, 
    total_amount, 
    sold_at, 
    payment_method,
    gcash_reference_code,
    gcash_transaction_timestamp_utc,
    gcash_image_url,
    gcash_verified_at_utc,
    gcash_verification_status
  )
  VALUES (
    p_session_id, 
    v_total_amount, 
    NOW(), 
    p_payment_method,
    p_gcash_reference_code,
    p_gcash_transaction_timestamp_utc,
    p_gcash_image_url,
    CASE WHEN p_payment_method = 'gcash' THEN NOW() ELSE NULL END,
    CASE WHEN p_payment_method = 'gcash' THEN 'confirmed' ELSE NULL END
  )
  RETURNING id INTO v_sale_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, NULL);

    -- Get product price if not provided
    IF v_unit_price IS NULL THEN
      SELECT price INTO v_unit_price
      FROM products
      WHERE id = v_product_id;
    END IF;

    -- Insert sale item
    INSERT INTO sale_items (sale_id, product_id, quantity, price)
    VALUES (v_sale_id, v_product_id, v_quantity, v_unit_price);

    -- Process recipes and deduct inventory (FIFO)
    FOR v_recipe_record IN
      SELECT ingredient_id, quantity as required_quantity
      FROM recipes
      WHERE product_id = v_product_id
    LOOP
      -- Calculate total needed for this ingredient
      v_needed := v_recipe_record.required_quantity * v_quantity;

      -- Consume from batches (FIFO - oldest first)
      FOR v_batch_record IN
        SELECT id, quantity, ingredient_id
        FROM inventory_batches
        WHERE ingredient_id = v_recipe_record.ingredient_id
          AND quantity > 0
        ORDER BY received_at ASC
      LOOP
        IF v_needed <= 0 THEN
          EXIT;
        END IF;

        v_available := v_batch_record.quantity;
        v_to_consume := LEAST(v_needed, v_available);

        -- Update batch
        UPDATE inventory_batches
        SET quantity = quantity - v_to_consume
        WHERE id = v_batch_record.id;

        -- Update ingredient current_stock
        UPDATE ingredients
        SET current_stock = current_stock - v_to_consume
        WHERE id = v_recipe_record.ingredient_id;

        v_needed := v_needed - v_to_consume;
      END LOOP;

      -- Check if we have enough stock
      IF v_needed > 0 THEN
        RAISE EXCEPTION 'Insufficient stock for ingredient % (needed: %, available: %)',
          (SELECT name FROM ingredients WHERE id = v_recipe_record.ingredient_id),
          v_needed + (v_recipe_record.required_quantity * v_quantity - v_needed),
          (SELECT current_stock FROM ingredients WHERE id = v_recipe_record.ingredient_id);
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_sale_id;
END;
$$;

-- ============================================
-- Migration 0011: Storage bucket policies
-- ============================================
-- Note: The bucket itself should be created manually in Supabase Dashboard or via the storage API
-- This bucket should be PRIVATE (not public) for security

-- Policy to allow authenticated/admin users to upload GCash transaction images
CREATE POLICY IF NOT EXISTS "Allow uploads to gcash-transactions"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'gcash-transactions');

-- Policy to allow authenticated/admin users to read GCash transaction images
CREATE POLICY IF NOT EXISTS "Allow reads from gcash-transactions"
ON storage.objects
FOR SELECT
USING (bucket_id = 'gcash-transactions');

-- Policy to allow authenticated/admin users to update GCash transaction images
CREATE POLICY IF NOT EXISTS "Allow updates to gcash-transactions"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'gcash-transactions');

-- Policy to allow authenticated/admin users to delete GCash transaction images
CREATE POLICY IF NOT EXISTS "Allow deletes from gcash-transactions"
ON storage.objects
FOR DELETE
USING (bucket_id = 'gcash-transactions');



