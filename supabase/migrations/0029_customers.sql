-- Customer Module: Simple customer database with phone lookup
-- Store-scoped; staff sees their store, admin sees all stores
--
-- -----------------------------------------------------------------------------
-- Customers table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_customers_store ON public.customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_store_phone ON public.customers(store_id, phone);

-- -----------------------------------------------------------------------------
-- Add customer_id to sales table (nullable, for backward compatibility)
-- -----------------------------------------------------------------------------
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_customer ON public.sales(customer_id);

-- -----------------------------------------------------------------------------
-- RLS: customers (staff sees own store, admin sees all)
-- -----------------------------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select_own_store_or_admin" ON public.customers;
CREATE POLICY "customers_select_own_store_or_admin"
  ON public.customers
  FOR SELECT
  USING (public.is_admin() OR store_id = public.current_store_id(auth.uid()));

DROP POLICY IF EXISTS "customers_insert_own_store_or_admin" ON public.customers;
CREATE POLICY "customers_insert_own_store_or_admin"
  ON public.customers
  FOR INSERT
  WITH CHECK (public.is_admin() OR store_id = public.current_store_id(auth.uid()));

DROP POLICY IF EXISTS "customers_update_own_store_or_admin" ON public.customers;
CREATE POLICY "customers_update_own_store_or_admin"
  ON public.customers
  FOR UPDATE
  USING (public.is_admin() OR store_id = public.current_store_id(auth.uid()))
  WITH CHECK (public.is_admin() OR store_id = public.current_store_id(auth.uid()));

DROP POLICY IF EXISTS "customers_delete_own_store_or_admin" ON public.customers;
CREATE POLICY "customers_delete_own_store_or_admin"
  ON public.customers
  FOR DELETE
  USING (public.is_admin() OR store_id = public.current_store_id(auth.uid()));

-- -----------------------------------------------------------------------------
-- RLS: sales.customer_id (allow read, allow insert with customer from own store)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "sales_select_customer" ON public.sales;
CREATE POLICY "sales_select_customer"
  ON public.sales
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "sales_insert_customer" ON public.sales;
CREATE POLICY "sales_insert_customer"
  ON public.sales
  FOR INSERT
  WITH CHECK (
    customer_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.customers
      WHERE id = sales.customer_id
        AND (public.is_admin() OR store_id = public.current_store_id(auth.uid()))
    )
  );

-- -----------------------------------------------------------------------------
-- Function: updated_at trigger for customers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_customers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_updated_at ON public.customers;
CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_customers_updated_at();
