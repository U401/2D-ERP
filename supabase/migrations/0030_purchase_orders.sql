-- Purchase Orders Module: Simple PO tracking
-- Store-scoped; staff sees their store, admin sees all stores
--
-- -----------------------------------------------------------------------------
-- Purchase Orders table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  po_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'cancelled')),
  total_amount NUMERIC DEFAULT 0,
  notes TEXT,
  delivery_date DATE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_store ON public.purchase_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON public.purchase_orders(po_number);

-- -----------------------------------------------------------------------------
-- Purchase Order Items table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  received_quantity NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON public.purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_ingredient ON public.purchase_order_items(ingredient_id);

-- -----------------------------------------------------------------------------
-- RLS: purchase_orders (staff sees own store, admin sees all)
-- -----------------------------------------------------------------------------
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_orders_select_own_store_or_admin" ON public.purchase_orders;
CREATE POLICY "purchase_orders_select_own_store_or_admin"
  ON public.purchase_orders
  FOR SELECT
  USING (public.is_admin() OR store_id = public.current_store_id(auth.uid()));

DROP POLICY IF EXISTS "purchase_orders_insert_own_store_or_admin" ON public.purchase_orders;
CREATE POLICY "purchase_orders_insert_own_store_or_admin"
  ON public.purchase_orders
  FOR INSERT
  WITH CHECK (public.is_admin() OR store_id = public.current_store_id(auth.uid()));

DROP POLICY IF EXISTS "purchase_orders_update_own_store_or_admin" ON public.purchase_orders;
CREATE POLICY "purchase_orders_update_own_store_or_admin"
  ON public.purchase_orders
  FOR UPDATE
  USING (public.is_admin() OR store_id = public.current_store_id(auth.uid()))
  WITH CHECK (public.is_admin() OR store_id = public.current_store_id(auth.uid()));

DROP POLICY IF EXISTS "purchase_orders_delete_own_store_or_admin" ON public.purchase_orders;
CREATE POLICY "purchase_orders_delete_own_store_or_admin"
  ON public.purchase_orders
  FOR DELETE
  USING (public.is_admin() OR store_id = public.current_store_id(auth.uid()));

-- -----------------------------------------------------------------------------
-- RLS: purchase_order_items (follow parent PO)
-- -----------------------------------------------------------------------------
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_order_items_select_via_po" ON public.purchase_order_items;
CREATE POLICY "purchase_order_items_select_via_po"
  ON public.purchase_order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE purchase_orders.id = purchase_order_items.purchase_order_id
        AND (public.is_admin() OR purchase_orders.store_id = public.current_store_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "purchase_order_items_insert_via_po" ON public.purchase_order_items;
CREATE POLICY "purchase_order_items_insert_via_po"
  ON public.purchase_order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE purchase_orders.id = purchase_order_items.purchase_order_id
        AND (public.is_admin() OR purchase_orders.store_id = public.current_store_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "purchase_order_items_update_via_po" ON public.purchase_order_items;
CREATE POLICY "purchase_order_items_update_via_po"
  ON public.purchase_order_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE purchase_orders.id = purchase_order_items.purchase_order_id
        AND (public.is_admin() OR purchase_orders.store_id = public.current_store_id(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE purchase_orders.id = purchase_order_items.purchase_order_id
        AND (public.is_admin() OR purchase_orders.store_id = public.current_store_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "purchase_order_items_delete_via_po" ON public.purchase_order_items;
CREATE POLICY "purchase_order_items_delete_via_po"
  ON public.purchase_order_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE purchase_orders.id = purchase_order_items.purchase_order_id
        AND (public.is_admin() OR purchase_orders.store_id = public.current_store_id(auth.uid()))
    )
  );

-- -----------------------------------------------------------------------------
-- Function: updated_at trigger for purchase_orders
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_purchase_orders_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_purchase_orders_updated_at();

-- -----------------------------------------------------------------------------
-- RPC: generate_po_number
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_po_number(p_store_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_count BIGINT;
BEGIN
  -- Use store ID prefix + year
  v_prefix := 'PO-' || EXTRACT(YEAR FROM NOW()) || '-';
  
  -- Count POs this year
  SELECT COUNT(*) INTO v_count
  FROM public.purchase_orders
  WHERE store_id = p_store_id
    AND created_at >= DATE_TRUNC('year', NOW());
  
  RETURN v_prefix || LPAD((v_count + 1)::TEXT, 4, '0');
END;
$$;
