-- Admin reports: store-filtered ingredient usage
-- This avoids "combined across all stores" results when an admin selects a store.

CREATE OR REPLACE FUNCTION public.ingredient_usage_for_store(
  p_store_id UUID,
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
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_store_id UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_store_id := p_store_id;
  IF v_store_id IS NULL THEN
    v_store_id := public.current_store_id(v_uid);
  END IF;

  -- Non-admins can only request their own store.
  IF NOT public.is_admin(v_uid) AND v_store_id IS DISTINCT FROM public.current_store_id(v_uid) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.name,
    i.unit,
    COALESCE(
      SUM(
        CASE
          WHEN s.id IS NULL THEN 0
          ELSE (r.quantity * si.quantity)
        END
      ),
      0
    ) AS used_quantity,
    i.current_stock AS remaining_stock
  FROM public.ingredients i
  LEFT JOIN public.recipes r
    ON r.ingredient_id = i.id
    AND r.store_id = i.store_id
  LEFT JOIN public.sale_items si
    ON si.product_id = r.product_id
    AND si.store_id = i.store_id
  LEFT JOIN public.sales s
    ON s.id = si.sale_id
    AND s.store_id = i.store_id
    AND s.sold_at BETWEEN p_from AND p_to
  WHERE i.store_id = v_store_id
  GROUP BY i.id, i.name, i.unit, i.current_stock
  ORDER BY i.name;
END;
$$;


