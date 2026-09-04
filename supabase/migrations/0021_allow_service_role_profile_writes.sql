-- Allow service_role (Edge Functions / admin tasks) to write protected profile fields safely.

CREATE OR REPLACE FUNCTION public.protect_profiles_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allow_store_update BOOLEAN := FALSE;
  v_role TEXT;
BEGIN
  -- service_role (Edge Functions) bypasses user-level checks; it's trusted.
  v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

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















