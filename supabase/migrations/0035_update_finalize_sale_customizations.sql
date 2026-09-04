-- Migration 0035: Update finalize_sale to handle customizations

DROP FUNCTION IF EXISTS public.finalize_sale(UUID, JSONB);
DROP FUNCTION IF EXISTS public.finalize_sale(UUID, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.finalize_sale(UUID, JSONB, TEXT, TEXT, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.finalize_sale(UUID, JSONB, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.finalize_sale(UUID, JSONB, TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT);

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
SET search_path TO 'public'
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
    v_customizations JSONB;
BEGIN
    v_store_id := public.current_store_id();
    IF v_store_id IS NULL THEN
        RAISE EXCEPTION 'No store assigned to this user. Please re-login.';
    END IF;

    IF p_client_side_id IS NOT NULL THEN
        SELECT id INTO v_sale_id FROM public.sales
        WHERE store_id = v_store_id AND client_side_id = p_client_side_id;
        
        IF v_sale_id IS NOT NULL THEN
            RETURN v_sale_id;
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE id = p_session_id AND status = 'open' AND store_id = v_store_id) THEN
        RAISE EXCEPTION 'Session is not open, does not exist, or does not belong to this store';
    END IF;

    IF p_payment_method NOT IN ('cash', 'card', 'gcash') THEN
        RAISE EXCEPTION 'Invalid payment method. Must be cash, card, or gcash';
    END IF;

    IF p_payment_method = 'gcash' THEN
        IF p_gcash_reference_code IS NULL OR p_gcash_transaction_timestamp_utc IS NULL THEN
            RAISE EXCEPTION 'GCash payment requires reference code and transaction timestamp';
        END IF;
        
        IF EXISTS (SELECT 1 FROM public.sales WHERE gcash_reference_code = p_gcash_reference_code AND gcash_reference_code IS NOT NULL) THEN
            RAISE EXCEPTION 'Reference code has already been used.';
        END IF;
    END IF;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Sale must contain at least one item';
    END IF;

    -- First pass: calculate total amount
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_unit_price := COALESCE((v_item->>('unit_price'))::NUMERIC, 0);
        v_quantity := (v_item->>('quantity'))::INTEGER;
        
        IF v_unit_price <= 0 THEN
            SELECT price INTO v_unit_price FROM public.products 
            WHERE id = (v_item->>('product_id'))::UUID AND store_id = v_store_id;
            
            IF v_unit_price IS NULL THEN
                RAISE EXCEPTION 'Product not found in this store';
            END IF;
        END IF;
        
        v_total_amount := v_total_amount + (v_unit_price * v_quantity);
    END LOOP;

    -- Create sale record
    INSERT INTO public.sales (
        session_id, total_amount, sold_at, payment_method, 
        gcash_reference_code, gcash_transaction_timestamp_utc, gcash_image_url, 
        gcash_verified_at_utc, gcash_verification_status, customer_id, store_id, client_side_id
    ) VALUES (
        p_session_id, v_total_amount, NOW(), p_payment_method, 
        p_gcash_reference_code, p_gcash_transaction_timestamp_utc, p_gcash_image_url,
        CASE WHEN p_payment_method = 'gcash' THEN NOW() ELSE NULL END,
        CASE WHEN p_payment_method = 'gcash' THEN 'confirmed' ELSE NULL END,
        p_customer_id, v_store_id, p_client_side_id
    ) RETURNING id INTO v_sale_id;

    -- Second pass: insert items and deduct inventory
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>('product_id'))::UUID;
        v_quantity := (v_item->>('quantity'))::INTEGER;
        v_unit_price := COALESCE((v_item->>('unit_price'))::NUMERIC, NULL);
        v_customizations := COALESCE(v_item->'customizations', '[]'::jsonb);

        IF v_unit_price IS NULL THEN
            SELECT price INTO v_unit_price FROM public.products 
            WHERE id = v_product_id AND store_id = v_store_id;
        END IF;

        IF v_unit_price IS NULL THEN
            RAISE EXCEPTION 'Product not found in this store';
        END IF;

        -- Insert sale item
        INSERT INTO public.sale_items (sale_id, product_id, quantity, price, store_id, customizations)
        VALUES (v_sale_id, v_product_id, v_quantity, v_unit_price, v_store_id, v_customizations);

        -- Deduct inventory using combined recipe and customizations
        FOR v_recipe_record IN 
            WITH recipe_ingredients AS (
                SELECT ingredient_id, quantity AS required_quantity
                FROM public.recipes
                WHERE product_id = v_product_id AND store_id = v_store_id
            ),
            custom_ingredients AS (
                SELECT 
                    (c->>'ingredient_id')::UUID as ingredient_id,
                    (c->>'delta')::NUMERIC as delta
                FROM jsonb_array_elements(v_customizations) c
            ),
            combined AS (
                SELECT 
                    COALESCE(r.ingredient_id, c.ingredient_id) as ingredient_id,
                    COALESCE(r.required_quantity, 0) + COALESCE(c.delta, 0) as final_quantity
                FROM recipe_ingredients r
                FULL OUTER JOIN custom_ingredients c ON r.ingredient_id = c.ingredient_id
            )
            SELECT ingredient_id, final_quantity FROM combined WHERE final_quantity > 0
        LOOP
            v_needed := v_recipe_record.final_quantity * v_quantity;

            -- Lock the ingredient record first
            PERFORM 1 FROM public.ingredients 
            WHERE id = v_recipe_record.ingredient_id AND store_id = v_store_id
            FOR UPDATE;

            -- Deduct from oldest batches first (FIFO)
            FOR v_batch_record IN 
                SELECT id, quantity, ingredient_id
                FROM public.inventory_batches
                WHERE ingredient_id = v_recipe_record.ingredient_id AND store_id = v_store_id AND quantity > 0
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

            -- If we still need more after going through all batches, inventory is insufficient
            IF v_needed > 0 THEN
                RAISE EXCEPTION 'Insufficient stock for an ingredient';
            END IF;
        END LOOP;
    END LOOP;

    RETURN v_sale_id;
END;
$$;
