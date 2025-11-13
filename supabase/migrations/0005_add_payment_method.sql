-- Add payment_method to sales table
ALTER TABLE sales 
  ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('cash', 'card'));

CREATE INDEX idx_sales_payment_method ON sales(payment_method);


