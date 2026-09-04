ALTER TABLE public.salary_rates ADD COLUMN IF NOT EXISTS pay_type TEXT NOT NULL DEFAULT 'hourly' CHECK (pay_type IN ('hourly', 'daily'));
ALTER TABLE public.salary_rates ADD COLUMN IF NOT EXISTS daily_rate NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS half_day_late_threshold_mins INTEGER NOT NULL DEFAULT 120;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS full_day_late_threshold_mins INTEGER NOT NULL DEFAULT 240;
