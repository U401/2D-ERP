-- Add kiosk clock in/out RPCs and expand store staff select policy

-- Allow staff to see staff in the same store (for Time Clock page)
DROP POLICY IF EXISTS "profiles_select_store_staff" ON public.profiles;
CREATE POLICY "profiles_select_store_staff"
  ON public.profiles
  FOR SELECT
  USING (
    public.is_admin()
    OR (
      store_id IS NOT NULL
      AND store_id = public.current_store_id()
      AND role IS DISTINCT FROM 'admin'
    )
  );

-- RPC: clock_in_for_user
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

  -- Verify PIN for target user
  SELECT pin_hash INTO v_pin_hash
  FROM public.employee_auth_factors
  WHERE user_id = p_user_id;

  IF v_pin_hash IS NULL THEN
    RAISE EXCEPTION 'PIN not set for this employee. Please contact admin.';
  END IF;

  IF v_pin_hash <> crypt(p_pin, v_pin_hash) THEN
    RAISE EXCEPTION 'Invalid PIN';
  END IF;

  -- Ensure not already clocked in
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

-- RPC: clock_out_for_user
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

  -- Verify PIN for target user
  SELECT pin_hash INTO v_pin_hash
  FROM public.employee_auth_factors
  WHERE user_id = p_user_id;

  IF v_pin_hash IS NULL THEN
    RAISE EXCEPTION 'PIN not set for this employee. Please contact admin.';
  END IF;

  IF v_pin_hash <> crypt(p_pin, v_pin_hash) THEN
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

