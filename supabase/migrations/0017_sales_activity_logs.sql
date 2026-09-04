-- Ensure sales inserts are logged into activity_logs as "sale" events.
-- Captures order_id, who made it (user_id inferred from session), and when (sold_at).

CREATE OR REPLACE FUNCTION public.log_sale_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_created_at TIMESTAMPTZ;
BEGIN
  -- Infer the staff user via the session that owns the sale
  SELECT s.user_id INTO v_user_id
  FROM public.sessions s
  WHERE s.id = NEW.session_id;

  v_created_at := COALESCE(NEW.sold_at, NOW());

  INSERT INTO public.activity_logs (user_id, action_type, details, created_at)
  VALUES (
    v_user_id,
    'sale',
    jsonb_build_object(
      'order_id', NEW.id,
      'sale_id', NEW.id,
      'session_id', NEW.session_id,
      'total_amount', NEW.total_amount,
      'sold_at', NEW.sold_at
    ),
    v_created_at
  );

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sales_activity_ins') THEN
    CREATE TRIGGER trg_sales_activity_ins
    AFTER INSERT ON public.sales
    FOR EACH ROW EXECUTE FUNCTION public.log_sale_activity();
  END IF;
END $$;

-- Backfill: create missing sale logs for existing sales
INSERT INTO public.activity_logs (user_id, action_type, details, created_at)
SELECT
  s2.user_id,
  'sale',
  jsonb_build_object(
    'order_id', sa.id,
    'sale_id', sa.id,
    'session_id', sa.session_id,
    'total_amount', sa.total_amount,
    'sold_at', sa.sold_at
  ),
  COALESCE(sa.sold_at, NOW())
FROM public.sales sa
LEFT JOIN public.sessions s2 ON s2.id = sa.session_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.activity_logs al
  WHERE al.action_type = 'sale'
    AND (al.details->>'sale_id') = sa.id::text
);















