-- Migration: backfill missing inventory_batches rows
-- 
-- Root cause: some ingredients had current_stock seeded directly into
-- ingredients.current_stock without ever calling restock(), so no batch
-- row existed. finalize_sale FIFO loop found nothing, threw "Insufficient stock".
--
-- This is idempotent: only inserts for ingredients with stock but no valid batch.

INSERT INTO public.inventory_batches (ingredient_id, quantity, cost, received_at, store_id)
SELECT 
  i.id,
  i.current_stock,
  0,
  NOW(),
  i.store_id
FROM public.ingredients i
WHERE 
  i.store_id IS NOT NULL
  AND i.current_stock > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory_batches b
    WHERE b.ingredient_id = i.id
      AND b.store_id = i.store_id
      AND b.quantity > 0
  );
