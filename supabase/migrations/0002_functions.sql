-- RPC Functions for Coffee Shop ERP
-- All functions use SECURITY DEFINER for elevated privileges

-- Open a new session
CREATE OR REPLACE FUNCTION open_session()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id UUID;
  v_existing_open UUID;
BEGIN
  -- Check if there's already an open session
  SELECT id INTO v_existing_open
  FROM sessions
  WHERE status = 'open'
  LIMIT 1;

  IF v_existing_open IS NOT NULL THEN
    RAISE EXCEPTION 'A session is already open. Please close it first.';
  END IF;

  -- Create new session
  INSERT INTO sessions (status, opened_at)
  VALUES ('open', NOW())
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

-- Close a session
CREATE OR REPLACE FUNCTION close_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate session exists and is open
  IF NOT EXISTS (
    SELECT 1 FROM sessions WHERE id = p_session_id
  ) THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM sessions WHERE id = p_session_id AND status = 'closed'
  ) THEN
    RAISE EXCEPTION 'Session is already closed';
  END IF;

  -- Close the session
  UPDATE sessions
  SET status = 'closed', closed_at = NOW()
  WHERE id = p_session_id;
END;
$$;

-- Restock an ingredient (creates batch and updates current_stock)
CREATE OR REPLACE FUNCTION restock(
  p_ingredient_id UUID,
  p_quantity NUMERIC,
  p_cost NUMERIC,
  p_received_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch_id UUID;
BEGIN
  -- Validate inputs
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;

  IF p_cost < 0 THEN
    RAISE EXCEPTION 'Cost cannot be negative';
  END IF;

  -- Create inventory batch
  INSERT INTO inventory_batches (ingredient_id, quantity, cost, received_at)
  VALUES (p_ingredient_id, p_quantity, p_cost, p_received_at)
  RETURNING id INTO v_batch_id;

  -- Update ingredient current_stock
  UPDATE ingredients
  SET current_stock = current_stock + p_quantity
  WHERE id = p_ingredient_id;

  RETURN v_batch_id;
END;
$$;

-- Finalize a sale (FIFO stock deduction)
CREATE OR REPLACE FUNCTION finalize_sale(
  p_session_id UUID,
  p_items JSONB
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

  -- Create sale record
  INSERT INTO sales (session_id, total_amount, sold_at)
  VALUES (p_session_id, v_total_amount, NOW())
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

-- Get ingredient usage report
CREATE OR REPLACE FUNCTION ingredient_usage(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE (
  ingredient_id UUID,
  ingredient_name TEXT,
  unit TEXT,
  used_quantity NUMERIC,
  remaining_stock NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.name,
    i.unit,
    COALESCE(SUM(r.quantity * si.quantity), 0) as used_quantity,
    i.current_stock as remaining_stock
  FROM ingredients i
  LEFT JOIN recipes r ON r.ingredient_id = i.id
  LEFT JOIN sale_items si ON si.product_id = r.product_id
  LEFT JOIN sales s ON s.id = si.sale_id
  WHERE s.sold_at BETWEEN p_from AND p_to
     OR s.sold_at IS NULL
  GROUP BY i.id, i.name, i.unit, i.current_stock
  ORDER BY i.name;
END;
$$;

-- Get session summary
CREATE OR REPLACE FUNCTION session_summary(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'session_id', p_session_id,
    'total_revenue', COALESCE(SUM(s.total_amount), 0),
    'total_items', COALESCE(SUM(si.quantity), 0),
    'total_sales', COUNT(DISTINCT s.id),
    'opened_at', (SELECT opened_at FROM sessions WHERE id = p_session_id),
    'closed_at', (SELECT closed_at FROM sessions WHERE id = p_session_id),
    'status', (SELECT status FROM sessions WHERE id = p_session_id)
  )
  INTO v_result
  FROM sales s
  LEFT JOIN sale_items si ON si.sale_id = s.id
  WHERE s.session_id = p_session_id;

  RETURN COALESCE(v_result, jsonb_build_object('session_id', p_session_id));
END;
$$;

