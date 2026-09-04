-- HR Module: Employee scheduling, time clock, and PIN authentication
-- Store-scoped; admin-only visibility except clock events (employees can insert their own)

-- -----------------------------------------------------------------------------
-- Add phone to profiles
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);

-- -----------------------------------------------------------------------------
-- Employee weekly schedules (default shift templates)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_weekly_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  grace_minutes INTEGER NOT NULL DEFAULT 5, -- Grace period before considered late (minutes)
  unpaid_break_minutes INTEGER NOT NULL DEFAULT 30, -- Automatic unpaid break deduction (minutes)
  is_day_off BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_employee_weekly_schedules_store_user
  ON public.employee_weekly_schedules(store_id, user_id);
CREATE INDEX IF NOT EXISTS idx_employee_weekly_schedules_user_day
  ON public.employee_weekly_schedules(user_id, day_of_week);

-- -----------------------------------------------------------------------------
-- Employee schedule overrides (holidays, changed shifts, special arrangements)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_schedule_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  grace_minutes INTEGER NOT NULL DEFAULT 5,
  unpaid_break_minutes INTEGER NOT NULL DEFAULT 30,
  reason TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_employee_schedule_overrides_store_date
  ON public.employee_schedule_overrides(store_id, work_date);
CREATE INDEX IF NOT EXISTS idx_employee_schedule_overrides_user_date
  ON public.employee_schedule_overrides(user_id, work_date);

-- -----------------------------------------------------------------------------
-- Time clock events (append-only; hours computed from these)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.time_clock_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('clock_in', 'clock_out', 'break_start', 'break_end', 'admin_edit')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'pin' CHECK (source IN ('pin', 'biometric', 'admin_edit')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- NULL when self-inserted
  notes TEXT, -- For admin_edit events (reason for adjustment)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_clock_events_user_occurred
  ON public.time_clock_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_clock_events_store_occurred
  ON public.time_clock_events(store_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_clock_events_user_type_occurred
  ON public.time_clock_events(user_id, event_type, occurred_at DESC);

-- -----------------------------------------------------------------------------
-- Employee auth factors (PIN, biometric placeholders)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_auth_factors (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  pin_set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  biometric_credential_ref TEXT, -- Placeholder: reference to external biometric system
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_auth_factors_user
  ON public.employee_auth_factors(user_id);

-- -----------------------------------------------------------------------------
-- View: Currently clocked-in employees (admin-only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_employees_currently_clocked_in AS
WITH last_event AS (
  SELECT DISTINCT ON (e.user_id)
    e.user_id,
    e.store_id,
    e.event_type,
    e.occurred_at
  FROM public.time_clock_events e
  ORDER BY e.user_id, e.occurred_at DESC
)
SELECT
  le.user_id,
  le.store_id,
  le.occurred_at AS clocked_in_at
FROM last_event le
WHERE le.event_type = 'clock_in';

-- -----------------------------------------------------------------------------
-- RPC: clock_in
-- -----------------------------------------------------------------------------
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

  -- Get store
  v_store_id := public.current_store_id(v_uid);
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No store assigned to this user. Please re-login.';
  END IF;

  -- Verify PIN
  SELECT pin_hash INTO v_pin_hash
  FROM public.employee_auth_factors
  WHERE user_id = v_uid;

  IF v_pin_hash IS NULL THEN
    RAISE EXCEPTION 'PIN not set for this employee. Please contact admin.';
  END IF;

  IF v_pin_hash <> crypt(p_pin, v_pin_hash) THEN
    RAISE EXCEPTION 'Invalid PIN';
  END IF;

  -- Ensure no open clock_in (no clock_out after last clock_in)
  IF EXISTS (
    SELECT 1 FROM public.v_employees_currently_clocked_in
    WHERE user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Already clocked in. Clock out first.';
  END IF;

  -- Insert clock_in event
  INSERT INTO public.time_clock_events (store_id, user_id, event_type, source)
  VALUES (v_store_id, v_uid, 'clock_in', 'pin')
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: clock_out
-- -----------------------------------------------------------------------------
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

  -- Get store
  v_store_id := public.current_store_id(v_uid);
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No store assigned to this user. Please re-login.';
  END IF;

  -- Verify PIN
  SELECT pin_hash INTO v_pin_hash
  FROM public.employee_auth_factors
  WHERE user_id = v_uid;

  IF v_pin_hash IS NULL THEN
    RAISE EXCEPTION 'PIN not set for this employee. Please contact admin.';
  END IF;

  IF v_pin_hash <> crypt(p_pin, v_pin_hash) THEN
    RAISE EXCEPTION 'Invalid PIN';
  END IF;

  -- Ensure there is an open clock_in
  IF NOT EXISTS (
    SELECT 1 FROM public.v_employees_currently_clocked_in
    WHERE user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Not clocked in. Clock in first.';
  END IF;

  -- Insert clock_out event
  INSERT INTO public.time_clock_events (store_id, user_id, event_type, source)
  VALUES (v_store_id, v_uid, 'clock_out', 'pin')
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: admin_set_employee_pin (service-role only)
-- -----------------------------------------------------------------------------
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
  -- Hash PIN using crypt (bcrypt-like)
  v_pin_hash := crypt(p_pin, gen_salt('bf'));

  INSERT INTO public.employee_auth_factors (user_id, pin_hash, updated_by)
  VALUES (p_user_id, v_pin_hash, auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash,
        updated_by = auth.uid(),
        updated_at = NOW();

  RETURN TRUE;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: get_employee_schedule_for_date
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_employee_schedule_for_date(
  p_user_id UUID,
  p_work_date DATE
)
RETURNS TABLE (
  day_of_week SMALLINT,
  start_time TIME,
  end_time TIME,
  grace_minutes INTEGER,
  unpaid_break_minutes INTEGER,
  is_day_off BOOLEAN,
  is_override BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_of_week SMALLINT;
BEGIN
  -- Determine day of week (0=Sunday, 6=Saturday)
  v_day_of_week := EXTRACT(DOW FROM p_work_date)::SMALLINT;

  -- Check for override first
  RETURN QUERY
  SELECT
    v_day_of_week,
    start_time,
    end_time,
    grace_minutes,
    unpaid_break_minutes,
    FALSE AS is_day_off,
    TRUE AS is_override
  FROM public.employee_schedule_overrides
  WHERE user_id = p_user_id AND work_date = p_work_date;

  -- If no override, fall back to weekly schedule
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      day_of_week,
      start_time,
      end_time,
      grace_minutes,
      unpaid_break_minutes,
      is_day_off,
      FALSE AS is_override
    FROM public.employee_weekly_schedules
    WHERE user_id = p_user_id AND day_of_week = v_day_of_week;
  END IF;

  RETURN;
END;
$$;

-- -----------------------------------------------------------------------------
-- RLS: employee_weekly_schedules (admin only)
-- -----------------------------------------------------------------------------
ALTER TABLE public.employee_weekly_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_weekly_schedules_admin_only" ON public.employee_weekly_schedules;
CREATE POLICY "employee_weekly_schedules_admin_only"
  ON public.employee_weekly_schedules
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- RLS: employee_schedule_overrides (admin only)
-- -----------------------------------------------------------------------------
ALTER TABLE public.employee_schedule_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_schedule_overrides_admin_only" ON public.employee_schedule_overrides;
CREATE POLICY "employee_schedule_overrides_admin_only"
  ON public.employee_schedule_overrides
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- RLS: time_clock_events (admin can read all; employees can insert their own)
-- -----------------------------------------------------------------------------
ALTER TABLE public.time_clock_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "time_clock_events_select_admin" ON public.time_clock_events;
CREATE POLICY "time_clock_events_select_admin"
  ON public.time_clock_events
  FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "time_clock_events_insert_self" ON public.time_clock_events;
CREATE POLICY "time_clock_events_insert_self"
  ON public.time_clock_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "time_clock_events_insert_admin" ON public.time_clock_events;
CREATE POLICY "time_clock_events_insert_admin"
  ON public.time_clock_events
  FOR INSERT
  WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- RLS: employee_auth_factors (admin can read/write; employees can read their own)
-- -----------------------------------------------------------------------------
ALTER TABLE public.employee_auth_factors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_auth_factors_select_self_or_admin" ON public.employee_auth_factors;
CREATE POLICY "employee_auth_factors_select_self_or_admin"
  ON public.employee_auth_factors
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "employee_auth_factors_update_admin" ON public.employee_auth_factors;
CREATE POLICY "employee_auth_factors_update_admin"
  ON public.employee_auth_factors
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- RLS: profiles.phone (admin only for now)
-- -----------------------------------------------------------------------------
-- Note: Existing profiles policies will apply; ensure phone is admin-only
DROP POLICY IF EXISTS "profiles_update_phone_admin" ON public.profiles;
CREATE POLICY "profiles_update_phone_admin"
  ON public.profiles
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin() OR (id = auth.uid() AND phone IS NOT DISTINCT FROM phone));

DROP POLICY IF EXISTS "profiles_select_phone_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_phone_self_or_admin"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin() OR id = auth.uid());

-- -----------------------------------------------------------------------------
-- Function to ensure pgcrypto is available for crypt/gen_salt
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    CREATE EXTENSION pgcrypto;
  END IF;
END
$$;
