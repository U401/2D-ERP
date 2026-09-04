-- Shift blocks for weekly schedules (AM/PM)

CREATE TABLE IF NOT EXISTS public.employee_shift_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  shift_slot TEXT NOT NULL CHECK (shift_slot IN ('am', 'pm')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  grace_minutes INTEGER NOT NULL DEFAULT 5,
  unpaid_break_minutes INTEGER NOT NULL DEFAULT 30,
  is_day_off BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, day_of_week, shift_slot)
);

CREATE INDEX IF NOT EXISTS idx_employee_shift_blocks_store_user
  ON public.employee_shift_blocks(store_id, user_id);
CREATE INDEX IF NOT EXISTS idx_employee_shift_blocks_user_day
  ON public.employee_shift_blocks(user_id, day_of_week);

ALTER TABLE public.employee_shift_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_shift_blocks_admin_only" ON public.employee_shift_blocks;
CREATE POLICY "employee_shift_blocks_admin_only"
  ON public.employee_shift_blocks
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
