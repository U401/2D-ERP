-- Payroll Module: Simple hourly rate tracking and payslip generation
-- Store-scoped; staff sees own store, admin sees all stores
--
-- -----------------------------------------------------------------------------
-- Salary rates table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salary_rates (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  hourly_rate NUMERIC NOT NULL,
  position_title TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_rates_user ON public.salary_rates(user_id);
CREATE INDEX IF NOT EXISTS idx_salary_rates_store ON public.salary_rates(store_id);

-- -----------------------------------------------------------------------------
-- Payslips table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  hours_worked NUMERIC NOT NULL DEFAULT 0,
  gross_pay NUMERIC NOT NULL DEFAULT 0,
  net_pay NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payslips_user ON public.payslips(user_id);
CREATE INDEX IF NOT EXISTS idx_payslips_store ON public.payslips(store_id);
CREATE INDEX IF NOT EXISTS idx_payslips_period ON public.payslips(period_start, period_end);

-- -----------------------------------------------------------------------------
-- RLS: salary_rates (staff sees own store, admin sees all)
-- -----------------------------------------------------------------------------
ALTER TABLE public.salary_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "salary_rates_select_own_store_or_admin" ON public.salary_rates;
CREATE POLICY "salary_rates_select_own_store_or_admin"
  ON public.salary_rates
  FOR SELECT
  USING (public.is_admin() OR store_id = public.current_store_id(auth.uid()));

DROP POLICY IF EXISTS "salary_rates_update_own_store_or_admin" ON public.salary_rates;
CREATE POLICY "salary_rates_update_own_store_or_admin"
  ON public.salary_rates
  FOR ALL
  USING (public.is_admin() OR store_id = public.current_store_id(auth.uid()))
  WITH CHECK (public.is_admin() OR store_id = public.current_store_id(auth.uid()));

-- -----------------------------------------------------------------------------
-- RLS: payslips (staff sees own, admin sees all)
-- -----------------------------------------------------------------------------
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payslips_select_self_or_admin" ON public.payslips;
CREATE POLICY "payslips_select_self_or_admin"
  ON public.payslips
  FOR SELECT
  USING (public.is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "payslips_insert_own_store_or_admin" ON public.payslips;
CREATE POLICY "payslips_insert_own_store_or_admin"
  ON public.payslips
  FOR INSERT
  WITH CHECK (public.is_admin() OR store_id = public.current_store_id(auth.uid()));

-- -----------------------------------------------------------------------------
-- Function: updated_at trigger for salary_rates
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_salary_rates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS salary_rates_updated_at ON public.salary_rates;
CREATE TRIGGER salary_rates_updated_at
  BEFORE UPDATE ON public.salary_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_salary_rates_updated_at();
