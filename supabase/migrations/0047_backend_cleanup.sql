-- 0047_backend_cleanup.sql
-- Backend housekeeping: drop duplicate indexes, backfill legacy null store_ids
-- Applied: 2026-09-28

-- 1. Drop duplicate indexes on user_presence (both indexed updated_at DESC)
DROP INDEX IF EXISTS public.idx_user_presence_updated;

-- 2. Drop duplicate index on screen_shares (both indexed user_id, created_at DESC)
DROP INDEX IF EXISTS public.idx_screen_shares_user;

-- 3. Backfill null store_id on legacy pre-multi-tenant data (Nov 2025, before migration 0019)
UPDATE sessions SET store_id = '105cda60-f06c-4425-9a58-e38c6aa4a9f7' WHERE store_id IS NULL;
UPDATE sales SET store_id = '105cda60-f06c-4425-9a58-e38c6aa4a9f7' WHERE store_id IS NULL;
UPDATE sale_items SET store_id = '105cda60-f06c-4425-9a58-e38c6aa4a9f7' WHERE store_id IS NULL;
