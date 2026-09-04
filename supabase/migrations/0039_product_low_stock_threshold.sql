-- Add configurable low-stock threshold per product
-- This replaces the hardcoded <=5 servings check in AdminNotificationListener

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 5;

COMMENT ON COLUMN products.low_stock_threshold IS 'Notify admin when fewer than this many servings can be made from current ingredient stock';
