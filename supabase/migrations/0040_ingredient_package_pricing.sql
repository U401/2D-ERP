-- Add package pricing columns to ingredients table
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS purchase_price NUMERIC,
  ADD COLUMN IF NOT EXISTS purchase_yield NUMERIC,
  ADD COLUMN IF NOT EXISTS purchase_unit TEXT;

COMMENT ON COLUMN public.ingredients.purchase_price IS 'The price the ingredient was purchased for (e.g. 519)';
COMMENT ON COLUMN public.ingredients.purchase_yield IS 'The total yield in the base unit (e.g. 2000 ml)';
COMMENT ON COLUMN public.ingredients.purchase_unit IS 'The original unit it was purchased in (e.g. Liters)';
