-- Migration 0046: Add refund support for sales and refund_sale RPC

-- 1. Add status and refund tracking columns to sales table
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS refunded_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS refund_reason text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales(status);

-- 2. Create refund_sale RPC
CREATE OR REPLACE FUNCTION public.refund_sale(
    p_sale_id uuid,
    p_reason text DEFAULT 'Customer refund'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_store_id UUID;
    v_sale_id UUID;
    v_sale_store_id UUID;
    v_sale_total NUMERIC;
    v_sale_status TEXT;
    v_is_admin BOOLEAN := FALSE;
    v_target_store_id UUID;
    v_item_record RECORD;
    v_recipe_record RECORD;
    v_qty_to_restore NUMERIC;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check if user is admin
    SELECT (role = 'admin') INTO v_is_admin
    FROM public.profiles
    WHERE id = v_user_id;

    v_store_id := public.current_store_id(v_user_id);

    -- Lock and retrieve sale
    SELECT id, store_id, total_amount, status
    INTO v_sale_id, v_sale_store_id, v_sale_total, v_sale_status
    FROM public.sales
    WHERE id = p_sale_id
    FOR UPDATE;

    IF v_sale_id IS NULL THEN
        RAISE EXCEPTION 'Sale not found';
    END IF;

    IF v_sale_status = 'refunded' THEN
        RAISE EXCEPTION 'This order has already been refunded';
    END IF;

    -- If not admin, ensure sale belongs to user's store
    IF NOT COALESCE(v_is_admin, FALSE) THEN
        IF v_store_id IS NOT NULL AND v_sale_store_id IS NOT NULL AND v_sale_store_id != v_store_id THEN
            RAISE EXCEPTION 'Unauthorized: sale belongs to another store';
        END IF;
    END IF;

    v_target_store_id := COALESCE(v_sale_store_id, v_store_id);

    -- Mark sale as refunded
    UPDATE public.sales
    SET status = 'refunded',
        refunded_at = NOW(),
        refund_reason = COALESCE(p_reason, 'Customer refund')
    WHERE id = p_sale_id;

    -- Restore inventory for each item in the sale
    IF v_target_store_id IS NOT NULL THEN
        FOR v_item_record IN 
            SELECT product_id, quantity, COALESCE(customizations, '[]'::jsonb) AS customizations
            FROM public.sale_items
            WHERE sale_id = p_sale_id
        LOOP
            FOR v_recipe_record IN 
                WITH recipe_ingredients AS (
                    SELECT ingredient_id, quantity AS required_quantity
                    FROM public.recipes
                    WHERE product_id = v_item_record.product_id AND store_id = v_target_store_id
                ),
                custom_ingredients AS (
                    SELECT 
                        (c->>'ingredient_id')::UUID as ingredient_id,
                        (c->>'delta')::NUMERIC as delta
                    FROM jsonb_array_elements(v_item_record.customizations) c
                    WHERE (c->>'ingredient_id') IS NOT NULL
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
                v_qty_to_restore := v_recipe_record.final_quantity * v_item_record.quantity;

                IF v_qty_to_restore > 0 THEN
                    -- Lock ingredient row if it exists
                    PERFORM 1 FROM public.ingredients
                    WHERE id = v_recipe_record.ingredient_id AND store_id = v_target_store_id
                    FOR UPDATE;

                    IF FOUND THEN
                        -- 1. Increase current_stock
                        UPDATE public.ingredients
                        SET current_stock = current_stock + v_qty_to_restore
                        WHERE id = v_recipe_record.ingredient_id AND store_id = v_target_store_id;

                        -- 2. Insert batch into inventory_batches so future sales FIFO works
                        INSERT INTO public.inventory_batches (
                            ingredient_id, quantity, cost, received_at, store_id
                        ) VALUES (
                            v_recipe_record.ingredient_id,
                            v_qty_to_restore,
                            0,
                            NOW(),
                            v_target_store_id
                        );
                    END IF;
                END IF;
            END LOOP;
        END LOOP;
    END IF;

    -- Log activity
    INSERT INTO public.activity_logs (user_id, action_type, details, store_id)
    VALUES (
        v_user_id,
        'refund_sale',
        jsonb_build_object(
            'sale_id', p_sale_id,
            'amount', v_sale_total,
            'reason', COALESCE(p_reason, 'Customer refund')
        ),
        v_target_store_id
    );

    RETURN p_sale_id;
END;
$function$;
