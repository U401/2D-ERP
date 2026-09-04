-- Drop the old cost column since it is unused and replaced by purchase_price and purchase_yield
ALTER TABLE public.ingredients DROP COLUMN IF EXISTS cost;
