-- Admin monitoring + multi-user sessions
-- This migration makes sessions track the user who opened them (so multiple staff can have open sessions simultaneously),
-- and adds an activity log feed so admin can see who did what and when.

-- -----------------------------------------------------------------------------
-- PROFILES (basic)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  username TEXT,
  role TEXT NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- SESSIONS: add user_id and helpful indexes
-- -----------------------------------------------------------------------------
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS user_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_fkey'
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sessions_user_status_opened
  ON public.sessions(user_id, status, opened_at DESC);

-- -----------------------------------------------------------------------------
-- ACTIVITY LOGS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
  ON public.activity_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id
  ON public.activity_logs(user_id);

-- -----------------------------------------------------------------------------
-- Update open_session / close_session to be per-user (multiple users can be open)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_session()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Allow multiple open sessions across users, but keep ONE open session per user.
  IF EXISTS (
    SELECT 1 FROM sessions
    WHERE status = 'open' AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'A session is already open for this user. Please close it first.';
  END IF;

  INSERT INTO sessions (status, opened_at, user_id)
  VALUES ('open', NOW(), v_user_id)
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_is_admin BOOLEAN := FALSE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT (role = 'admin') INTO v_is_admin
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id) THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id AND status = 'closed') THEN
    RAISE EXCEPTION 'Session is already closed';
  END IF;

  -- Non-admin users can only close their own sessions.
  IF NOT v_is_admin AND NOT EXISTS (
    SELECT 1 FROM sessions WHERE id = p_session_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized to close this session';
  END IF;

  UPDATE sessions
  SET status = 'closed', closed_at = NOW()
  WHERE id = p_session_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Activity triggers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_session_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.activity_logs (user_id, action_type, details)
    VALUES (
      NEW.user_id,
      'open_session',
      jsonb_build_object('session_id', NEW.id, 'opened_at', NEW.opened_at)
    );
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.status = 'open' AND NEW.status = 'closed') THEN
      INSERT INTO public.activity_logs (user_id, action_type, details)
      VALUES (
        NEW.user_id,
        'close_session',
        jsonb_build_object('session_id', NEW.id, 'closed_at', NEW.closed_at)
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sessions_activity_ins') THEN
    CREATE TRIGGER trg_sessions_activity_ins
    AFTER INSERT ON public.sessions
    FOR EACH ROW EXECUTE FUNCTION public.log_session_activity();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sessions_activity_upd') THEN
    CREATE TRIGGER trg_sessions_activity_upd
    AFTER UPDATE ON public.sessions
    FOR EACH ROW EXECUTE FUNCTION public.log_session_activity();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.log_sale_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT s.user_id INTO v_user_id
  FROM public.sessions s
  WHERE s.id = NEW.session_id;

  INSERT INTO public.activity_logs (user_id, action_type, details)
  VALUES (
    v_user_id,
    'sale',
    jsonb_build_object(
      'sale_id', NEW.id,
      'session_id', NEW.session_id,
      'total_amount', NEW.total_amount,
      'sold_at', NEW.sold_at
    )
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

-- -----------------------------------------------------------------------------
-- Basic RLS (permissive for internal ERP; tighten later if needed)
-- -----------------------------------------------------------------------------
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='activity_logs') THEN
    -- leave existing policies
    NULL;
  END IF;
END $$;

DROP POLICY IF EXISTS "Allow all activity_logs" ON public.activity_logs;
CREATE POLICY "Allow all activity_logs"
  ON public.activity_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);


