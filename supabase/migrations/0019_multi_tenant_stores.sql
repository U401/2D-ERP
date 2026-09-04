-- Multi-tenant: per-account Store isolation
-- Each authenticated user has one Store (their business). Non-admins can only see/write their Store's data.
-- Admins can see/write across all Stores.

-- -----------------------------------------------------------------------------
-- STORES + profile link
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Store',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id)
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_store_id ON public.profiles(store_id);
CREATE INDEX IF NOT EXISTS idx_stores_owner_user_id ON public.stores(owner_user_id);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_store_id(p_uid UUID DEFAULT auth.uid())
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_id FROM public.profiles WHERE id = p_uid;
$$;

-- Create a store for the current user if missing and attach it to profiles.store_id.
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

-- -----------------------------------------------------------------------------
-- Add store_id columns (kept NULLable for "fresh start"; legacy rows become invisible to non-admins)
-- -----------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ingredients_store_id ON public.ingredients(store_id);

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_suppliers_store_id ON public.suppliers(store_id);

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_recipes_store_id ON public.recipes(store_id);

ALTER TABLE public.inventory_batches
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_inventory_batches_store_id ON public.inventory_batches(store_id);

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_sessions_store_id ON public.sessions(store_id);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_sales_store_id ON public.sales(store_id);

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_sale_items_store_id ON public.sale_items(store_id);

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_activity_logs_store_id ON public.activity_logs(store_id);

-- -----------------------------------------------------------------------------
-- Auto-fill store_id on inserts from the client
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_store_id_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
BEGIN
  IF NEW.store_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_store_id := public.current_store_id();
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No store assigned to this user. Please re-login.';
  END IF;

  NEW.store_id := v_store_id;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_products_set_store') THEN
    CREATE TRIGGER trg_products_set_store
    BEFORE INSERT ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.set_store_id_from_profile();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ingredients_set_store') THEN
    CREATE TRIGGER trg_ingredients_set_store
    BEFORE INSERT ON public.ingredients
    FOR EACH ROW EXECUTE FUNCTION public.set_store_id_from_profile();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_suppliers_set_store') THEN
    CREATE TRIGGER trg_suppliers_set_store
    BEFORE INSERT ON public.suppliers
    FOR EACH ROW EXECUTE FUNCTION public.set_store_id_from_profile();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_recipes_set_store') THEN
    CREATE TRIGGER trg_recipes_set_store
    BEFORE INSERT ON public.recipes
    FOR EACH ROW EXECUTE FUNCTION public.set_store_id_from_profile();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_inventory_batches_set_store') THEN
    CREATE TRIGGER trg_inventory_batches_set_store
    BEFORE INSERT ON public.inventory_batches
    FOR EACH ROW EXECUTE FUNCTION public.set_store_id_from_profile();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_activity_logs_set_store') THEN
    CREATE TRIGGER trg_activity_logs_set_store
    BEFORE INSERT ON public.activity_logs
    FOR EACH ROW EXECUTE FUNCTION public.set_store_id_from_profile();
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Update RPCs to be store-aware
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
  v_store_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_store_id := public.current_store_id(v_user_id);
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No store assigned to this user. Please re-login.';
  END IF;

  -- Keep ONE open session per user, within their store.
  IF EXISTS (
    SELECT 1 FROM public.sessions
    WHERE status = 'open' AND user_id = v_user_id AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'A session is already open for this user. Please close it first.';
  END IF;

  INSERT INTO public.sessions (status, opened_at, user_id, store_id)
  VALUES ('open', NOW(), v_user_id, v_store_id)
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
  v_store_id UUID;
  v_is_admin BOOLEAN := FALSE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_store_id := public.current_store_id(v_user_id);
  SELECT (role = 'admin') INTO v_is_admin
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE id = p_session_id) THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sessions WHERE id = p_session_id AND status = 'closed') THEN
    RAISE EXCEPTION 'Session is already closed';
  END IF;

  -- Admin can close any. Non-admin only their store + their session.
  IF NOT v_is_admin AND NOT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE id = p_session_id AND user_id = v_user_id AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Not authorized to close this session';
  END IF;

  UPDATE public.sessions
  SET status = 'closed', closed_at = NOW()
  WHERE id = p_session_id;
END;
$$;

-- Store-aware restock: validate ingredient belongs to caller's store; write batches.store_id.
CREATE OR REPLACE FUNCTION public.restock(
  p_ingredient_id UUID,
  p_quantity NUMERIC,
  p_cost NUMERIC,
  p_received_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
  v_store_id UUID;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;
  IF p_cost < 0 THEN
    RAISE EXCEPTION 'Cost cannot be negative';
  END IF;

  v_store_id := public.current_store_id();
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No store assigned to this user. Please re-login.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ingredients
    WHERE id = p_ingredient_id AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Ingredient not found in this store';
  END IF;

  INSERT INTO public.inventory_batches (ingredient_id, quantity, cost, received_at, store_id)
  VALUES (p_ingredient_id, p_quantity, p_cost, p_received_at, v_store_id)
  RETURNING id INTO v_batch_id;

  UPDATE public.ingredients
  SET current_stock = current_stock + p_quantity
  WHERE id = p_ingredient_id AND store_id = v_store_id;

  RETURN v_batch_id;
END;
$$;

-- Store-aware finalize_sale (based on the latest finalize_sale in 0014)
CREATE OR REPLACE FUNCTION public.finalize_sale(
  p_session_id UUID,
  p_items JSONB,
  p_payment_method TEXT DEFAULT 'cash',
  p_gcash_reference_code TEXT DEFAULT NULL,
  p_gcash_transaction_timestamp_utc TIMESTAMPTZ DEFAULT NULL,
  p_gcash_image_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_total_amount NUMERIC := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INTEGER;
  v_unit_price NUMERIC;
  v_recipe_record RECORD;
  v_needed NUMERIC;
  v_available NUMERIC;
  v_batch_record RECORD;
  v_to_consume NUMERIC;
  v_store_id UUID;
BEGIN
  v_store_id := public.current_store_id();
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No store assigned to this user. Please re-login.';
  END IF;

  -- Validate session is open AND belongs to this store
  IF NOT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE id = p_session_id AND status = 'open' AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Session is not open, does not exist, or does not belong to this store';
  END IF;

  -- Validate payment method
  IF p_payment_method NOT IN ('cash', 'card', 'gcash') THEN
    RAISE EXCEPTION 'Invalid payment method. Must be cash, card, or gcash';
  END IF;

  -- Validate GCash-specific fields if payment method is GCash
  IF p_payment_method = 'gcash' THEN
    IF p_gcash_reference_code IS NULL OR p_gcash_transaction_timestamp_utc IS NULL THEN
      RAISE EXCEPTION 'GCash payment requires reference code and transaction timestamp';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.sales
      WHERE gcash_reference_code = p_gcash_reference_code
        AND gcash_reference_code IS NOT NULL
        AND store_id = v_store_id
    ) THEN
      RAISE EXCEPTION 'Reference code % has already been used in this store.', p_gcash_reference_code;
    END IF;
  END IF;

  -- Validate items array is not empty
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sale must contain at least one item';
  END IF;

  -- Calculate total amount (store-scoped products)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_quantity := (v_item->>'quantity')::INTEGER;

    IF v_unit_price <= 0 THEN
      SELECT price INTO v_unit_price
      FROM public.products
      WHERE id = (v_item->>'product_id')::UUID
        AND store_id = v_store_id;

      IF v_unit_price IS NULL THEN
        RAISE EXCEPTION 'Product not found in this store: %', v_item->>'product_id';
      END IF;
    END IF;

    v_total_amount := v_total_amount + (v_unit_price * v_quantity);
  END LOOP;

  -- Create sale record with store_id + payment method + GCash data
  INSERT INTO public.sales (
    session_id,
    total_amount,
    sold_at,
    payment_method,
    gcash_reference_code,
    gcash_transaction_timestamp_utc,
    gcash_image_url,
    gcash_verified_at_utc,
    gcash_verification_status,
    store_id
  )
  VALUES (
    p_session_id,
    v_total_amount,
    NOW(),
    p_payment_method,
    p_gcash_reference_code,
    p_gcash_transaction_timestamp_utc,
    p_gcash_image_url,
    CASE WHEN p_payment_method = 'gcash' THEN NOW() ELSE NULL END,
    CASE WHEN p_payment_method = 'gcash' THEN 'confirmed' ELSE NULL END,
    v_store_id
  )
  RETURNING id INTO v_sale_id;

  -- Process each item (store-scoped products + recipes + inventory)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, NULL);

    IF v_unit_price IS NULL THEN
      SELECT price INTO v_unit_price
      FROM public.products
      WHERE id = v_product_id AND store_id = v_store_id;
    END IF;

    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Product not found in this store: %', v_product_id;
    END IF;

    INSERT INTO public.sale_items (sale_id, product_id, quantity, price, store_id)
    VALUES (v_sale_id, v_product_id, v_quantity, v_unit_price, v_store_id);

    FOR v_recipe_record IN
      SELECT ingredient_id, quantity as required_quantity
      FROM public.recipes
      WHERE product_id = v_product_id AND store_id = v_store_id
    LOOP
      v_needed := v_recipe_record.required_quantity * v_quantity;

      FOR v_batch_record IN
        SELECT id, quantity, ingredient_id
        FROM public.inventory_batches
        WHERE ingredient_id = v_recipe_record.ingredient_id
          AND store_id = v_store_id
          AND quantity > 0
        ORDER BY received_at ASC
      LOOP
        IF v_needed <= 0 THEN
          EXIT;
        END IF;

        v_available := v_batch_record.quantity;
        v_to_consume := LEAST(v_needed, v_available);

        UPDATE public.inventory_batches
        SET quantity = quantity - v_to_consume
        WHERE id = v_batch_record.id AND store_id = v_store_id;

        UPDATE public.ingredients
        SET current_stock = current_stock - v_to_consume
        WHERE id = v_recipe_record.ingredient_id AND store_id = v_store_id;

        v_needed := v_needed - v_to_consume;
      END LOOP;

      IF v_needed > 0 THEN
        RAISE EXCEPTION 'Insufficient stock for ingredient %',
          (SELECT name FROM public.ingredients WHERE id = v_recipe_record.ingredient_id AND store_id = v_store_id);
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_sale_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Activity logging: include store_id (override existing functions)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_session_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.activity_logs (user_id, action_type, details, store_id)
    VALUES (
      NEW.user_id,
      'open_session',
      jsonb_build_object('session_id', NEW.id, 'opened_at', NEW.opened_at),
      NEW.store_id
    );
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.status = 'open' AND NEW.status = 'closed') THEN
      INSERT INTO public.activity_logs (user_id, action_type, details, store_id)
      VALUES (
        NEW.user_id,
        'close_session',
        jsonb_build_object('session_id', NEW.id, 'closed_at', NEW.closed_at),
        NEW.store_id
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_sale_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_created_at TIMESTAMPTZ;
  v_store_id UUID;
BEGIN
  SELECT s.user_id, s.store_id INTO v_user_id, v_store_id
  FROM public.sessions s
  WHERE s.id = NEW.session_id;

  v_created_at := COALESCE(NEW.sold_at, NOW());

  INSERT INTO public.activity_logs (user_id, action_type, details, created_at, store_id)
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
    v_created_at,
    COALESCE(NEW.store_id, v_store_id)
  );

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- RLS: replace permissive "allow all" policies with store isolation
-- -----------------------------------------------------------------------------
-- Stores table RLS
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stores_select_own_or_admin" ON public.stores;
CREATE POLICY "stores_select_own_or_admin"
  ON public.stores
  FOR SELECT
  USING (public.is_admin() OR owner_user_id = auth.uid());

DROP POLICY IF EXISTS "stores_insert_own" ON public.stores;
CREATE POLICY "stores_insert_own"
  ON public.stores
  FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "stores_update_own_or_admin" ON public.stores;
CREATE POLICY "stores_update_own_or_admin"
  ON public.stores
  FOR UPDATE
  USING (public.is_admin() OR owner_user_id = auth.uid())
  WITH CHECK (public.is_admin() OR owner_user_id = auth.uid());

DROP POLICY IF EXISTS "stores_delete_admin" ON public.stores;
CREATE POLICY "stores_delete_admin"
  ON public.stores
  FOR DELETE
  USING (public.is_admin());

-- Profiles: allow users to see/update their own profile; admin can see all
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_self_or_admin"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin() OR id = auth.uid());

DROP POLICY IF EXISTS "profiles_upsert_self" ON public.profiles;
CREATE POLICY "profiles_upsert_self"
  ON public.profiles
  FOR ALL
  USING (public.is_admin() OR id = auth.uid())
  WITH CHECK (public.is_admin() OR id = auth.uid());

-- Helper macro: store access predicate
-- For fresh-start: non-admins only see store_id not null + matches current_store_id.
-- Admins can see all rows (including legacy store_id null).

-- PRODUCTS
DROP POLICY IF EXISTS "Allow all operations on products" ON public.products;
DROP POLICY IF EXISTS "products_store_isolation" ON public.products;
CREATE POLICY "products_store_isolation"
  ON public.products
  FOR ALL
  USING (public.is_admin() OR (store_id IS NOT NULL AND store_id = public.current_store_id()))
  WITH CHECK (public.is_admin() OR store_id = public.current_store_id());

-- INGREDIENTS
DROP POLICY IF EXISTS "Allow all operations on ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_store_isolation" ON public.ingredients;
CREATE POLICY "ingredients_store_isolation"
  ON public.ingredients
  FOR ALL
  USING (public.is_admin() OR (store_id IS NOT NULL AND store_id = public.current_store_id()))
  WITH CHECK (public.is_admin() OR store_id = public.current_store_id());

-- SUPPLIERS
DROP POLICY IF EXISTS "Allow all operations on suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_store_isolation" ON public.suppliers;
CREATE POLICY "suppliers_store_isolation"
  ON public.suppliers
  FOR ALL
  USING (public.is_admin() OR (store_id IS NOT NULL AND store_id = public.current_store_id()))
  WITH CHECK (public.is_admin() OR store_id = public.current_store_id());

-- SESSIONS
DROP POLICY IF EXISTS "Allow all operations on sessions" ON public.sessions;
DROP POLICY IF EXISTS "sessions_store_isolation" ON public.sessions;
CREATE POLICY "sessions_store_isolation"
  ON public.sessions
  FOR ALL
  USING (public.is_admin() OR (store_id IS NOT NULL AND store_id = public.current_store_id()))
  WITH CHECK (public.is_admin() OR store_id = public.current_store_id());

-- SALES
DROP POLICY IF EXISTS "Allow all operations on sales" ON public.sales;
DROP POLICY IF EXISTS "sales_store_isolation" ON public.sales;
CREATE POLICY "sales_store_isolation"
  ON public.sales
  FOR ALL
  USING (public.is_admin() OR (store_id IS NOT NULL AND store_id = public.current_store_id()))
  WITH CHECK (
    public.is_admin()
    OR (
      store_id = public.current_store_id()
      AND EXISTS (
        SELECT 1 FROM public.sessions s
        WHERE s.id = session_id AND s.store_id = public.current_store_id()
      )
    )
  );

-- SALE ITEMS
DROP POLICY IF EXISTS "Allow all operations on sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_store_isolation" ON public.sale_items;
CREATE POLICY "sale_items_store_isolation"
  ON public.sale_items
  FOR ALL
  USING (public.is_admin() OR (store_id IS NOT NULL AND store_id = public.current_store_id()))
  WITH CHECK (
    public.is_admin()
    OR (
      store_id = public.current_store_id()
      AND EXISTS (SELECT 1 FROM public.sales sa WHERE sa.id = sale_id AND sa.store_id = public.current_store_id())
      AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.store_id = public.current_store_id())
    )
  );

-- RECIPES
DROP POLICY IF EXISTS "Allow all operations on recipes" ON public.recipes;
DROP POLICY IF EXISTS "recipes_store_isolation" ON public.recipes;
CREATE POLICY "recipes_store_isolation"
  ON public.recipes
  FOR ALL
  USING (public.is_admin() OR (store_id IS NOT NULL AND store_id = public.current_store_id()))
  WITH CHECK (
    public.is_admin()
    OR (
      store_id = public.current_store_id()
      AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.store_id = public.current_store_id())
      AND EXISTS (SELECT 1 FROM public.ingredients i WHERE i.id = ingredient_id AND i.store_id = public.current_store_id())
    )
  );

-- INVENTORY BATCHES
DROP POLICY IF EXISTS "Allow all operations on inventory_batches" ON public.inventory_batches;
DROP POLICY IF EXISTS "inventory_batches_store_isolation" ON public.inventory_batches;
CREATE POLICY "inventory_batches_store_isolation"
  ON public.inventory_batches
  FOR ALL
  USING (public.is_admin() OR (store_id IS NOT NULL AND store_id = public.current_store_id()))
  WITH CHECK (
    public.is_admin()
    OR (
      store_id = public.current_store_id()
      AND EXISTS (SELECT 1 FROM public.ingredients i WHERE i.id = ingredient_id AND i.store_id = public.current_store_id())
    )
  );

-- ACTIVITY LOGS
DROP POLICY IF EXISTS "Allow all activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_store_isolation" ON public.activity_logs;
CREATE POLICY "activity_logs_store_isolation"
  ON public.activity_logs
  FOR ALL
  USING (public.is_admin() OR (store_id IS NOT NULL AND store_id = public.current_store_id()))
  WITH CHECK (public.is_admin() OR store_id = public.current_store_id());















