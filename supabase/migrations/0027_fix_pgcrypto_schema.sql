-- Ensure pgcrypto is available in extensions schema
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Recreate RPCs with explicit pgcrypto schema usage

CREATE OR REPLACE FUNCTION public.clock_in(p_pin TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_store_id UUID;
  v_event_id UUID;
  v_pin_hash TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_store_id := public.current_store_id(v_uid);
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No store assigned to this user. Please re-login.';
  END IF;

  SELECT pin_hash INTO v_pin_hash
  FROM public.employee_auth_factors
  WHERE user_id = v_uid;

  IF v_pin_hash IS NULL THEN
    RAISE EXCEPTION 'PIN not set for this employee. Please contact admin.';
  END IF;

  IF v_pin_hash <> extensions.crypt(p_pin, v_pin_hash) THEN
    RAISE EXCEPTION 'Invalid PIN';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.v_employees_currently_clocked_in
    WHERE user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Already clocked in. Clock out first.';
  END IF;

  INSERT INTO public.time_clock_events (store_id, user_id, event_type, source)
  VALUES (v_store_id, v_uid, 'clock_in', 'pin')
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.clock_out(p_pin TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_store_id UUID;
  v_event_id UUID;
  v_pin_hash TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_store_id := public.current_store_id(v_uid);
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No store assigned to this user. Please re-login.';
  END IF;

  SELECT pin_hash INTO v_pin_hash
  FROM public.employee_auth_factors
  WHERE user_id = v_uid;

  IF v_pin_hash IS NULL THEN
    RAISE EXCEPTION 'PIN not set for this employee. Please contact admin.';
  END IF;

  IF v_pin_hash <> extensions.crypt(p_pin, v_pin_hash) THEN
    RAISE EXCEPTION 'Invalid PIN';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.v_employees_currently_clocked_in
    WHERE user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Not clocked in. Clock in first.';
  END IF;

  INSERT INTO public.time_clock_events (store_id, user_id, event_type, source)
  VALUES (v_store_id, v_uid, 'clock_out', 'pin')
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.clock_in_for_user(p_user_id UUID, p_pin TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_store_id UUID;
  v_target_store UUID;
  v_event_id UUID;
  v_pin_hash TEXT;
  v_last_event TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_store_id := public.current_store_id(v_uid);
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No store assigned to this user. Please re-login.';
  END IF;

  SELECT store_id INTO v_target_store
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_target_store IS NULL OR v_target_store <> v_store_id THEN
    RAISE EXCEPTION 'Not authorized to clock in for this user';
  END IF;

  SELECT pin_hash INTO v_pin_hash
  FROM public.employee_auth_factors
  WHERE user_id = p_user_id;

  IF v_pin_hash IS NULL THEN
    RAISE EXCEPTION 'PIN not set for this employee. Please contact admin.';
  END IF;

  IF v_pin_hash <> extensions.crypt(p_pin, v_pin_hash) THEN
    RAISE EXCEPTION 'Invalid PIN';
  END IF;

  SELECT event_type INTO v_last_event
  FROM public.time_clock_events
  WHERE user_id = p_user_id
  ORDER BY occurred_at DESC
  LIMIT 1;

  IF v_last_event = 'clock_in' THEN
    RAISE EXCEPTION 'Already clocked in. Clock out first.';
  END IF;

  INSERT INTO public.time_clock_events (store_id, user_id, event_type, source, created_by)
  VALUES (v_store_id, p_user_id, 'clock_in', 'pin', v_uid)
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.clock_out_for_user(p_user_id UUID, p_pin TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_store_id UUID;
  v_target_store UUID;
  v_event_id UUID;
  v_pin_hash TEXT;
  v_last_event TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_store_id := public.current_store_id(v_uid);
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No store assigned to this user. Please re-login.';
  END IF;

  SELECT store_id INTO v_target_store
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_target_store IS NULL OR v_target_store <> v_store_id THEN
    RAISE EXCEPTION 'Not authorized to clock out for this user';
  END IF;

  SELECT pin_hash INTO v_pin_hash
  FROM public.employee_auth_factors
  WHERE user_id = p_user_id;

  IF v_pin_hash IS NULL THEN
    RAISE EXCEPTION 'PIN not set for this employee. Please contact admin.';
  END IF;

  IF v_pin_hash <> extensions.crypt(p_pin, v_pin_hash) THEN
    RAISE EXCEPTION 'Invalid PIN';
  END IF;

  SELECT event_type INTO v_last_event
  FROM public.time_clock_events
  WHERE user_id = p_user_id
  ORDER BY occurred_at DESC
  LIMIT 1;

  IF v_last_event IS NULL OR v_last_event <> 'clock_in' THEN
    RAISE EXCEPTION 'Not clocked in. Clock in first.';
  END IF;

  INSERT INTO public.time_clock_events (store_id, user_id, event_type, source, created_by)
  VALUES (v_store_id, p_user_id, 'clock_out', 'pin', v_uid)
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_employee_pin(
  p_user_id UUID,
  p_pin TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin_hash TEXT;
BEGIN
  v_pin_hash := extensions.crypt(p_pin, extensions.gen_salt('bf'));

  INSERT INTO public.employee_auth_factors (user_id, pin_hash, updated_by)
  VALUES (p_user_id, v_pin_hash, auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash,
        updated_by = auth.uid(),
        updated_at = NOW();

  RETURN TRUE;
END;
$$;
