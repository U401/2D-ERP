-- Migration 0033: Fix product deletion FK, remove tax from finalize_sale, redeploy finalize_sale
-- 1. Change sale_items.product_id FK to SET NULL so products can be deleted even with sales history
-- 2. Allow product_id to be nullable
-- 3. Redeploy finalize_sale (fixes schema cache miss in new project)

-- Step 1: Drop old FK constraint on sale_items.product_id
ALTER TABLE public.sale_items
  DROP CONSTRAINT IF EXISTS sale_items_product_id_fkey;

-- Step 2: Make product_id nullable (so SET NULL works)
ALTER TABLE public.sale_items
  ALTER COLUMN product_id DROP NOT NULL;

-- Step 3: Re-add FK with ON DELETE SET NULL so deleting a product keeps sale history intact
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

-- Step 4: Drop all old versions of finalize_sale to avoid ambiguity
DROP FUNCTION IF EXISTS public.finalize_sale(UUID, JSONB);
DROP FUNCTION IF EXISTS public.finalize_sale(UUID, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.finalize_sale(UUID, JSONB, TEXT, TEXT, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.finalize_sale(UUID, JSONB, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.finalize_sale(UUID, JSONB, TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT);

-- Step 5: Re-create finalize_sale (no tax — total_amount = sum of items, no tax calculation)
CREATE OR REPLACE FUNCTION public.finalize_sale(
  p_session_id UUID,
  p_items JSONB,
  p_payment_method TEXT DEFAULT 'cash',
  p_gcash_reference_code TEXT DEFAULT NULL,
  p_gcash_transaction_timestamp_utc TIMESTAMPTZ DEFAULT NULL,
  p_gcash_image_url TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_client_side_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_store_id UUID;
BEGIN
  v_store_id := public.current_store_id();
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No store assigned to this user. Please re-login.';
  END IF;

  -- Idempotency check: if client_side_id is provided, check if it already exists for this store
  IF p_client_side_id IS NOT NULL THEN
    SELECT id INTO v_sale_id
    FROM public.sales
    WHERE store_id = v_store_id AND client_side_id = p_client_side_id;
    
    IF v_sale_id IS NOT NULL THEN
      RETURN v_sale_id; -- Return existing sale ID instead of creating a duplicate
    END IF;
  END IF;

  -- Validate session is open AND belongs to this store
  IF NOT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE id = p_session_id AND status = 'open' AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Session is not open, does not exist, or does not belong to this store';
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

    -- CRITICAL: Check for duplicate reference code GLOBALLY (across all stores)
    IF EXISTS (
      SELECT 1 FROM public.sales
      WHERE gcash_reference_code = p_gcash_reference_code
        AND gcash_reference_code IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Reference code % has already been used.', p_gcash_reference_code;
    END IF;
  END IF;

  -- Validate items array is not empty
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sale must contain at least one item';
  END IF;

  -- Calculate total amount (no tax — price is what the customer pays)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_quantity := (v_item->>'quantity')::INTEGER;

    IF v_unit_price <= 0 THEN
      SELECT price INTO v_unit_price
      FROM public.products
      WHERE id = (v_item->>'product_id')::UUID
        AND store_id = v_store_id;

      IF v_unit_price IS NULL THEN
        RAISE EXCEPTION 'Product not found in this store: %', v_item->>'product_id';
      END IF;
    END IF;

    v_total_amount := v_total_amount + (v_unit_price * v_quantity);
  END LOOP;

  -- Create sale record
  INSERT INTO public.sales (
    session_id,
    total_amount,
    sold_at,
    payment_method,
    gcash_reference_code,
    gcash_transaction_timestamp_utc,
    gcash_image_url,
    gcash_verified_at_utc,
    gcash_verification_status,
    customer_id,
    store_id,
    client_side_id
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
    CASE WHEN p_payment_method = 'gcash' THEN 'confirmed' ELSE NULL END,
    p_customer_id,
    v_store_id,
    p_client_side_id
  )
  RETURNING id INTO v_sale_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, NULL);

    IF v_unit_price IS NULL THEN
      SELECT price INTO v_unit_price
      FROM public.products
      WHERE id = v_product_id AND store_id = v_store_id;
    END IF;

    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Product not found in this store: %', v_product_id;
    END IF;

    INSERT INTO public.sale_items (sale_id, product_id, quantity, price, store_id)
    VALUES (v_sale_id, v_product_id, v_quantity, v_unit_price, v_store_id);

    FOR v_recipe_record IN
      SELECT ingredient_id, quantity as required_quantity
      FROM public.recipes
      WHERE product_id = v_product_id AND store_id = v_store_id
    LOOP
      v_needed := v_recipe_record.required_quantity * v_quantity;

      -- LOCK: Lock the ingredient row to prevent concurrent stock updates
      PERFORM 1 FROM public.ingredients 
      WHERE id = v_recipe_record.ingredient_id AND store_id = v_store_id
      FOR UPDATE;

      -- Consume from batches (FIFO - oldest first)
      FOR v_batch_record IN
        SELECT id, quantity, ingredient_id
        FROM public.inventory_batches
        WHERE ingredient_id = v_recipe_record.ingredient_id
          AND store_id = v_store_id
          AND quantity > 0
        ORDER BY received_at ASC
        FOR UPDATE
      LOOP
        IF v_needed <= 0 THEN
          EXIT;
        END IF;

        v_available := v_batch_record.quantity;
        v_to_consume := LEAST(v_needed, v_available);

        UPDATE public.inventory_batches
        SET quantity = quantity - v_to_consume
        WHERE id = v_batch_record.id AND store_id = v_store_id;

        UPDATE public.ingredients
        SET current_stock = current_stock - v_to_consume
        WHERE id = v_recipe_record.ingredient_id AND store_id = v_store_id;

        v_needed := v_needed - v_to_consume;
      END LOOP;

      IF v_needed > 0 THEN
        RAISE EXCEPTION 'Insufficient stock for ingredient %',
          (SELECT name FROM public.ingredients WHERE id = v_recipe_record.ingredient_id AND store_id = v_store_id);
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_sale_id;
END;
$$;
