'use client'

import { useState } from 'react'

export default function RunMigrationsPage() {
  const [copied, setCopied] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  // The SQL content
  const sqlContent = `-- Combined GCash and Sale Improvements Script
-- Run this entire script in Supabase SQL Editor to fix the POS sale issue

-- 1. Add client_side_id to sales table
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS client_side_id TEXT;

-- Create a unique index on (store_id, client_side_id) to prevent duplicate sales
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_store_client_side_id ON public.sales(store_id, client_side_id) WHERE client_side_id IS NOT NULL;

-- 2. Update finalize_sale RPC
-- First, drop ALL existing versions to avoid ambiguity errors
DROP FUNCTION IF EXISTS public.finalize_sale(UUID, JSONB);
DROP FUNCTION IF EXISTS public.finalize_sale(UUID, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.finalize_sale(UUID, JSONB, TEXT, TEXT, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.finalize_sale(UUID, JSONB, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.finalize_sale(UUID, JSONB, TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.finalize_sale(
  p_session_id UUID,
  p_items JSONB,
  p_payment_method TEXT DEFAULT 'cash',
  p_gcash_reference_code TEXT DEFAULT NULL,
  p_gcash_transaction_timestamp_utc TIMESTAMPTZ DEFAULT NULL,
  p_gcash_image_url TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_client_side_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_total_amount NUMERIC := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INTEGER;
  v_unit_price NUMERIC;
  v_recipe_record RECORD;
  v_needed NUMERIC;
  v_available NUMERIC;
  v_batch_record RECORD;
  v_to_consume NUMERIC;
  v_store_id UUID;
BEGIN
  v_store_id := public.current_store_id();
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No store assigned to this user. Please re-login.';
  END IF;

  -- Idempotency check
  IF p_client_side_id IS NOT NULL THEN
    SELECT id INTO v_sale_id
    FROM public.sales
    WHERE store_id = v_store_id AND client_side_id = p_client_side_id;
    
    IF v_sale_id IS NOT NULL THEN
      RETURN v_sale_id;
    END IF;
  END IF;

  -- Validate session
  IF NOT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE id = p_session_id AND status = 'open' AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Session is not open, does not exist, or does not belong to this store';
  END IF;

  -- Validate payment method
  IF p_payment_method NOT IN ('cash', 'card', 'gcash') THEN
    RAISE EXCEPTION 'Invalid payment method. Must be cash, card, or gcash';
  END IF;

  -- Validate GCash
  IF p_payment_method = 'gcash' THEN
    IF p_gcash_reference_code IS NULL OR p_gcash_transaction_timestamp_utc IS NULL THEN
      RAISE EXCEPTION 'GCash payment requires reference code and transaction timestamp';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.sales
      WHERE gcash_reference_code = p_gcash_reference_code
        AND gcash_reference_code IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Reference code % has already been used.', p_gcash_reference_code;
    END IF;
  END IF;

  -- Validate items
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sale must contain at least one item';
  END IF;

  -- Calculate total amount
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_quantity := (v_item->>'quantity')::INTEGER;

    IF v_unit_price <= 0 THEN
      SELECT price INTO v_unit_price
      FROM public.products
      WHERE id = (v_item->>'product_id')::UUID
        AND store_id = v_store_id;

      IF v_unit_price IS NULL THEN
        RAISE EXCEPTION 'Product not found in this store: %', v_item->>'product_id';
      END IF;
    END IF;

    v_total_amount := v_total_amount + (v_unit_price * v_quantity);
  END LOOP;

  -- Create sale record
  INSERT INTO public.sales (
    session_id,
    total_amount,
    sold_at,
    payment_method,
    gcash_reference_code,
    gcash_transaction_timestamp_utc,
    gcash_image_url,
    gcash_verified_at_utc,
    gcash_verification_status,
    customer_id,
    store_id,
    client_side_id
  )
  VALUES (
    p_session_id,
    v_total_amount,
    NOW(),
    p_payment_method,
    p_gcash_reference_code,
    p_gcash_transaction_timestamp_utc,
    p_gcash_image_url,
    CASE WHEN p_payment_method = 'gcash' THEN NOW() ELSE NULL END,
    CASE WHEN p_payment_method = 'gcash' THEN 'confirmed' ELSE NULL END,
    p_customer_id,
    v_store_id,
    p_client_side_id
  )
  RETURNING id INTO v_sale_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, NULL);

    IF v_unit_price IS NULL THEN
      SELECT price INTO v_unit_price
      FROM public.products
      WHERE id = v_product_id AND store_id = v_store_id;
    END IF;

    INSERT INTO public.sale_items (sale_id, product_id, quantity, price, store_id)
    VALUES (v_sale_id, v_product_id, v_quantity, v_unit_price, v_store_id);

    FOR v_recipe_record IN
      SELECT ingredient_id, quantity as required_quantity
      FROM public.recipes
      WHERE product_id = v_product_id AND store_id = v_store_id
    LOOP
      v_needed := v_recipe_record.required_quantity * v_quantity;

      PERFORM 1 FROM public.ingredients 
      WHERE id = v_recipe_record.ingredient_id AND store_id = v_store_id
      FOR UPDATE;

      FOR v_batch_record IN
        SELECT id, quantity, ingredient_id
        FROM public.inventory_batches
        WHERE ingredient_id = v_recipe_record.ingredient_id
          AND store_id = v_store_id
          AND quantity > 0
        ORDER BY received_at ASC
        FOR UPDATE
      LOOP
        IF v_needed <= 0 THEN
          EXIT;
        END IF;

        v_available := v_batch_record.quantity;
        v_to_consume := LEAST(v_needed, v_available);

        UPDATE public.inventory_batches
        SET quantity = quantity - v_to_consume
        WHERE id = v_batch_record.id AND store_id = v_store_id;

        UPDATE public.ingredients
        SET current_stock = current_stock - v_to_consume
        WHERE id = v_recipe_record.ingredient_id AND store_id = v_store_id;

        v_needed := v_needed - v_to_consume;
      END LOOP;

      IF v_needed > 0 THEN
        RAISE EXCEPTION 'Insufficient stock for ingredient %',
          (SELECT name FROM public.ingredients WHERE id = v_recipe_record.ingredient_id AND store_id = v_store_id);
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_sale_id;
END;
$$;`

  function handleCopy() {
    navigator.clipboard.writeText(sqlContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleRunDirect() {
    setRunning(true)
    setResult(null)

    try {
      setResult({
        success: false,
        message:
          'Direct execution is not available in the desktop (static) build. Please use Method 2: Manual Execution via Supabase SQL Editor.',
      })
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to run migrations'
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-black dark:text-white mb-4">
          Run GCash Database Migrations
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Choose one of the methods below to run the database migrations.
        </p>

        <div className="bg-white dark:bg-black rounded-lg border border-gray-200 dark:border-gray-800 p-6 space-y-6">
          {/* Method 1: Direct Execution */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Method 1: Direct Execution (Requires DATABASE_URL)
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              If you have DATABASE_URL in your .env.local, you can run migrations directly.
            </p>
            <button
              onClick={handleRunDirect}
              disabled={running}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {running ? 'Running Migrations...' : 'Run Migrations Directly'}
            </button>
            {result && (
              <div
                className={`p-4 rounded-lg ${
                  result.success
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
                    : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800'
                }`}
              >
                <p className="font-medium">{result.success ? '✅' : '⚠️'} {result.message}</p>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Method 2: Manual Execution (Recommended)
            </h2>
            <div className="flex justify-between items-center mb-4">
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Copy the SQL script and run it in Supabase SQL Editor
              </p>
              <button
                onClick={handleCopy}
                className="px-4 py-2 bg-button-gray text-gray-900 rounded-lg hover:bg-[#D0D0D0] transition-colors text-sm font-medium border border-gray-200 flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <span className="material-symbols-outlined text-green-600">check</span>
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">content_copy</span>
                    <span>Copy SQL</span>
                  </>
                )}
              </button>
            </div>

            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-96 overflow-y-auto">
              <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap">
                {sqlContent}
              </pre>
            </div>

            <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
              <h3 className="font-semibold mb-2 text-blue-800 dark:text-blue-200">
                Instructions:
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-blue-700 dark:text-blue-300">
                <li>Click "Copy SQL" button above</li>
                <li>Open Supabase Dashboard → SQL Editor</li>
                <li>Click "New Query"</li>
                <li>Paste the SQL (Ctrl+V)</li>
                <li>Click "Run" or press Ctrl+Enter</li>
                <li>Wait for success message</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
