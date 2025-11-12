-- Seed data for development/testing
-- Products
INSERT INTO products (name, price, category) VALUES
  ('Latte', 4.50, 'Hot Coffee'),
  ('Cappuccino', 4.50, 'Hot Coffee'),
  ('Americano', 3.75, 'Hot Coffee'),
  ('Espresso', 3.00, 'Hot Coffee'),
  ('Mocha', 5.00, 'Hot Coffee'),
  ('Macchiato', 3.50, 'Hot Coffee')
ON CONFLICT DO NOTHING;

-- Ingredients
INSERT INTO ingredients (name, unit, current_stock, cost, low_stock_threshold) VALUES
  ('Espresso Beans', 'kg', 20.0, 15.00, 5.0),
  ('Whole Milk', 'gallons', 12.0, 4.50, 3.0),
  ('Oat Milk', 'cartons', 6.0, 5.00, 2.0),
  ('Croissants', 'units', 50, 1.50, 10),
  ('Vanilla Syrup', 'bottles', 4.0, 8.00, 1.0),
  ('Caramel Syrup', 'bottles', 3.0, 8.00, 1.0)
ON CONFLICT DO NOTHING;

-- Recipes (simplified - each coffee uses beans and optionally milk)
-- Get product and ingredient IDs
DO $$
DECLARE
  v_latte_id UUID;
  v_cappuccino_id UUID;
  v_americano_id UUID;
  v_espresso_id UUID;
  v_mocha_id UUID;
  v_macchiato_id UUID;
  v_beans_id UUID;
  v_milk_id UUID;
  v_oat_milk_id UUID;
  v_vanilla_id UUID;
  v_caramel_id UUID;
BEGIN
  SELECT id INTO v_latte_id FROM products WHERE name = 'Latte';
  SELECT id INTO v_cappuccino_id FROM products WHERE name = 'Cappuccino';
  SELECT id INTO v_americano_id FROM products WHERE name = 'Americano';
  SELECT id INTO v_espresso_id FROM products WHERE name = 'Espresso';
  SELECT id INTO v_mocha_id FROM products WHERE name = 'Mocha';
  SELECT id INTO v_macchiato_id FROM products WHERE name = 'Macchiato';
  
  SELECT id INTO v_beans_id FROM ingredients WHERE name = 'Espresso Beans';
  SELECT id INTO v_milk_id FROM ingredients WHERE name = 'Whole Milk';
  SELECT id INTO v_oat_milk_id FROM ingredients WHERE name = 'Oat Milk';
  SELECT id INTO v_vanilla_id FROM ingredients WHERE name = 'Vanilla Syrup';
  SELECT id INTO v_caramel_id FROM ingredients WHERE name = 'Caramel Syrup';

  -- Latte: beans + milk
  INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES
    (v_latte_id, v_beans_id, 0.02),
    (v_latte_id, v_milk_id, 0.25)
  ON CONFLICT DO NOTHING;

  -- Cappuccino: beans + milk
  INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES
    (v_cappuccino_id, v_beans_id, 0.02),
    (v_cappuccino_id, v_milk_id, 0.20)
  ON CONFLICT DO NOTHING;

  -- Americano: beans + water (no ingredient for water)
  INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES
    (v_americano_id, v_beans_id, 0.02)
  ON CONFLICT DO NOTHING;

  -- Espresso: beans only
  INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES
    (v_espresso_id, v_beans_id, 0.02)
  ON CONFLICT DO NOTHING;

  -- Mocha: beans + milk + caramel
  INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES
    (v_mocha_id, v_beans_id, 0.02),
    (v_mocha_id, v_milk_id, 0.25),
    (v_mocha_id, v_caramel_id, 0.05)
  ON CONFLICT DO NOTHING;

  -- Macchiato: beans + milk
  INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES
    (v_macchiato_id, v_beans_id, 0.02),
    (v_macchiato_id, v_milk_id, 0.15)
  ON CONFLICT DO NOTHING;
END $$;

-- Create initial inventory batches
DO $$
DECLARE
  v_beans_id UUID;
  v_milk_id UUID;
  v_oat_milk_id UUID;
  v_croissants_id UUID;
  v_vanilla_id UUID;
BEGIN
  SELECT id INTO v_beans_id FROM ingredients WHERE name = 'Espresso Beans';
  SELECT id INTO v_milk_id FROM ingredients WHERE name = 'Whole Milk';
  SELECT id INTO v_oat_milk_id FROM ingredients WHERE name = 'Oat Milk';
  SELECT id INTO v_croissants_id FROM ingredients WHERE name = 'Croissants';
  SELECT id INTO v_vanilla_id FROM ingredients WHERE name = 'Vanilla Syrup';

  INSERT INTO inventory_batches (ingredient_id, quantity, cost, received_at) VALUES
    (v_beans_id, 20.0, 15.00, NOW() - INTERVAL '5 days'),
    (v_milk_id, 12.0, 4.50, NOW() - INTERVAL '2 days'),
    (v_oat_milk_id, 6.0, 5.00, NOW() - INTERVAL '1 day'),
    (v_croissants_id, 50, 1.50, NOW() - INTERVAL '3 days'),
    (v_vanilla_id, 4.0, 8.00, NOW() - INTERVAL '7 days')
  ON CONFLICT DO NOTHING;
END $$;

