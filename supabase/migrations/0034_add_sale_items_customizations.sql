-- Migration 0034: Add customizations to sale_items

ALTER TABLE public.sale_items
ADD COLUMN IF NOT EXISTS customizations JSONB DEFAULT '[]'::jsonb;
