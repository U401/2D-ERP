-- Monitoring: user presence + optional live screen sharing
-- This enables Admin -> Live Users to reflect who is online across devices.

-- -----------------------------------------------------------------------------
-- Helper: is_admin
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin(p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE id = p_uid), FALSE);
$$;

-- -----------------------------------------------------------------------------
-- USER PRESENCE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline', 'idle')),
  current_page TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_presence_updated_at
  ON public.user_presence(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen
  ON public.user_presence(last_seen DESC);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_presence_select_self_or_admin" ON public.user_presence;
CREATE POLICY "user_presence_select_self_or_admin"
  ON public.user_presence
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "user_presence_insert_self" ON public.user_presence;
CREATE POLICY "user_presence_insert_self"
  ON public.user_presence
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_presence_update_self" ON public.user_presence;
CREATE POLICY "user_presence_update_self"
  ON public.user_presence
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_presence_delete_admin" ON public.user_presence;
CREATE POLICY "user_presence_delete_admin"
  ON public.user_presence
  FOR DELETE
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- SCREEN SHARES (optional live screen view)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.screen_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  screenshot_data TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_screen_shares_user_created
  ON public.screen_shares(user_id, created_at DESC);

ALTER TABLE public.screen_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "screen_shares_select_self_or_admin" ON public.screen_shares;
CREATE POLICY "screen_shares_select_self_or_admin"
  ON public.screen_shares
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "screen_shares_insert_self" ON public.screen_shares;
CREATE POLICY "screen_shares_insert_self"
  ON public.screen_shares
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "screen_shares_delete_admin" ON public.screen_shares;
CREATE POLICY "screen_shares_delete_admin"
  ON public.screen_shares
  FOR DELETE
  USING (public.is_admin());

-- Cleanup helper for screenshots (called from the client periodically)
CREATE OR REPLACE FUNCTION public.cleanup_old_screenshots(p_keep_seconds INTEGER DEFAULT 300)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  DELETE FROM public.screen_shares
  WHERE created_at < NOW() - make_interval(secs => GREATEST(p_keep_seconds, 0));

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;















