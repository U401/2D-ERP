-- Lock down multi-tenant boundary:
-- Prevent non-admin users from changing protected profile fields (role, store_id, id).
-- Allow store_id to be set ONLY via SECURITY DEFINER helpers (e.g., ensure_store_for_user).

-- -----------------------------------------------------------------------------
-- Guard trigger for profiles
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profiles_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allow_store_update BOOLEAN := FALSE;
BEGIN
  -- Admin can do anything.
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Allow store_id changes only when explicitly permitted by a security definer helper.
  v_allow_store_update := COALESCE(current_setting('app.allow_store_id_update', true), '') = 'true';

  IF (TG_OP = 'INSERT') THEN
    -- Normal users can only insert their own profile row.
    IF NEW.id <> auth.uid() THEN
      RAISE EXCEPTION 'Not authorized to insert this profile';
    END IF;

    -- Non-admin cannot set role on insert (must be default or NULL).
    IF NEW.role IS NOT NULL AND NEW.role <> 'staff' THEN
      RAISE EXCEPTION 'Not authorized to set role';
    END IF;

    -- Non-admin cannot set store_id directly.
    IF NEW.store_id IS NOT NULL AND NOT v_allow_store_update THEN
      RAISE EXCEPTION 'Not authorized to set store';
    END IF;

    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    -- Normal users can only update their own profile row.
    IF OLD.id <> auth.uid() THEN
      RAISE EXCEPTION 'Not authorized to update this profile';
    END IF;

    -- Prevent role escalation.
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Not authorized to change role';
    END IF;

    -- Prevent changing store unless explicitly allowed.
    IF NEW.store_id IS DISTINCT FROM OLD.store_id AND NOT v_allow_store_update THEN
      RAISE EXCEPTION 'Not authorized to change store';
    END IF;

    -- Prevent primary key changes.
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Not authorized to change profile id';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_profiles_protect_fields') THEN
    CREATE TRIGGER trg_profiles_protect_fields
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profiles_fields();
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Tighten profiles RLS policies (remove overly-broad policy from 0019)
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_upsert_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_self_or_admin" ON public.profiles;

CREATE POLICY "profiles_select_self_or_admin"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin() OR id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_insert_self_or_admin"
  ON public.profiles
  FOR INSERT
  WITH CHECK (public.is_admin() OR id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_self_or_admin"
  ON public.profiles
  FOR UPDATE
  USING (public.is_admin() OR id = auth.uid())
  WITH CHECK (public.is_admin() OR id = auth.uid());

DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin"
  ON public.profiles
  FOR DELETE
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- Update ensure_store_for_user to set a local flag so the trigger allows store_id assignment
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_store_for_user(p_store_name TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_store_id UUID;
  v_username TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- allow store assignment inside this helper only
  PERFORM set_config('app.allow_store_id_update', 'true', true);

  -- Ensure profile exists
  INSERT INTO public.profiles (id)
  VALUES (v_uid)
  ON CONFLICT (id) DO NOTHING;

  SELECT store_id, username
    INTO v_store_id, v_username
  FROM public.profiles
  WHERE id = v_uid;

  IF v_store_id IS NOT NULL THEN
    RETURN v_store_id;
  END IF;

  INSERT INTO public.stores (owner_user_id, name)
  VALUES (
    v_uid,
    COALESCE(
      NULLIF(p_store_name, ''),
      CASE
        WHEN v_username IS NOT NULL AND v_username <> '' THEN 'Store - ' || v_username
        ELSE 'Store - ' || left(v_uid::text, 8)
      END
    )
  )
  RETURNING id INTO v_store_id;

  UPDATE public.profiles
  SET store_id = v_store_id
  WHERE id = v_uid;

  RETURN v_store_id;
END;
$$;















