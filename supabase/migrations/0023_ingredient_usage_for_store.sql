-- Admin Reports: ingredient usage filtered to a specific store.
-- This is used by the Admin → Reports tab so the Ingredient Usage table matches the selected store.

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
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'store_id is required';
  END IF;

  -- Only admins can query arbitrary stores. Non-admins can only query their own store.
  IF NOT public.is_admin() AND p_store_id <> public.current_store_id() THEN
    RAISE EXCEPTION 'Not authorized for this store';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.name,
    i.unit,
    COALESCE(SUM(r.quantity * si.quantity), 0) AS used_quantity,
    i.current_stock AS remaining_stock
  FROM public.ingredients i
  LEFT JOIN public.recipes r
    ON r.ingredient_id = i.id
   AND r.store_id = p_store_id
  LEFT JOIN public.sale_items si
    ON si.product_id = r.product_id
   AND si.store_id = p_store_id
  LEFT JOIN public.sales s
    ON s.id = si.sale_id
   AND s.store_id = p_store_id
  WHERE i.store_id = p_store_id
    AND (s.sold_at BETWEEN p_from AND p_to OR s.sold_at IS NULL)
  GROUP BY i.id, i.name, i.unit, i.current_stock
  ORDER BY i.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ingredient_usage_for_store(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ingredient_usage_for_store(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;














