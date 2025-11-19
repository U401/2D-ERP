-- Update finalize_sale function to accept payment_method
CREATE OR REPLACE FUNCTION finalize_sale(
  p_session_id UUID,
  p_items JSONB,
  p_payment_method TEXT DEFAULT 'cash'
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
  IF p_payment_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'Invalid payment method. Must be cash or card';
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

  -- Create sale record with payment method
  INSERT INTO sales (session_id, total_amount, sold_at, payment_method)
  VALUES (p_session_id, v_total_amount, NOW(), p_payment_method)
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







