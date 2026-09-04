-- Enforce single active login per account (latest login wins).
-- The client claims its instance_id in this table; other instances for the same user detect it and sign out.

CREATE TABLE IF NOT EXISTS public.user_active_logins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id TEXT NOT NULL,
  last_claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_active_logins_updated_at
  ON public.user_active_logins(updated_at DESC);

ALTER TABLE public.user_active_logins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_active_logins_select_own_or_admin" ON public.user_active_logins;
CREATE POLICY "user_active_logins_select_own_or_admin"
  ON public.user_active_logins
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "user_active_logins_insert_own" ON public.user_active_logins;
CREATE POLICY "user_active_logins_insert_own"
  ON public.user_active_logins
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_active_logins_update_own" ON public.user_active_logins;
CREATE POLICY "user_active_logins_update_own"
  ON public.user_active_logins
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_active_logins_delete_own" ON public.user_active_logins;
CREATE POLICY "user_active_logins_delete_own"
  ON public.user_active_logins
  FOR DELETE
  USING (auth.uid() = user_id);















