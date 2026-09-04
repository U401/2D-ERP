ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS grace_period_mins INTEGER NOT NULL DEFAULT 15;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS half_day_penalty_deduction_percentage NUMERIC NOT NULL DEFAULT 50;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS full_day_penalty_deduction_percentage NUMERIC NOT NULL DEFAULT 100;

NOTIFY pgrst, reload_schema;
