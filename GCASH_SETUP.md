# GCash Transaction Detection - Setup Guide

This guide will help you complete the setup for the GCash transaction image detection feature.

## Prerequisites Completed ✅
- [x] Google Cloud Vision API configured

## Step 2: Run Database Migrations

### Option A: Run Combined Script (Recommended)

1. Open your Supabase Dashboard
2. Go to **SQL Editor**
3. Click **New Query**
4. Open the file `scripts/run-gcash-migrations.sql` from this project
5. Copy the entire contents
6. Paste into the SQL Editor
7. Click **Run** (or press Ctrl+Enter)

This will run all three migrations at once:
- Migration 0009: Add GCash transaction fields
- Migration 0010: Update finalize_sale function
- Migration 0011: Create storage policies

### Option B: Run Individual Migrations

If you prefer to run them separately, execute these files in order:

1. `supabase/migrations/0009_add_gcash_transaction.sql`
2. `supabase/migrations/0010_update_finalize_sale_gcash.sql`
3. `supabase/migrations/0011_gcash_storage_bucket.sql`

### Verify Migrations

After running the migrations, you can verify by:

1. Going to `/setup-gcash` in your app
2. Click "Check Migrations Status" button
3. Or manually check in Supabase SQL Editor:
   ```sql
   SELECT column_name 
   FROM information_schema.columns 
   WHERE table_name = 'sales' 
   AND column_name LIKE 'gcash%';
   ```

You should see these columns:
- `gcash_reference_code`
- `gcash_transaction_timestamp_utc`
- `gcash_image_url`
- `gcash_verified_at_utc`
- `gcash_verification_status`
- `gcash_rejection_reason`

## Step 3: Create Storage Bucket

### Option A: Use Setup Page (Recommended)

1. Navigate to `/setup-gcash` in your app
2. Click **"Create GCash Transactions Bucket"** button
3. Wait for success message

### Option B: Manual Creation

1. Go to Supabase Dashboard → **Storage**
2. Click **"New bucket"**
3. Name: `gcash-transactions`
4. **Important**: Set it to **Private** (not public) for security
5. Click **"Create bucket"**
6. The RLS policies will be automatically created by migration 0011

### Verify Storage Bucket

After creation, verify:
1. Go to Supabase Dashboard → Storage
2. You should see `gcash-transactions` bucket listed
3. It should show as **Private**

## Step 4: Test the Feature

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to the POS page (`/pos`)

3. Add some items to the cart

4. Click the **"GCash"** payment button

5. Upload or capture a GCash transaction screenshot

6. The system should:
   - Extract text from the image
   - Validate it's a GCash transaction
   - Extract reference code and timestamp
   - Verify transaction is within 10 minutes
   - Complete the sale if valid

## Troubleshooting

### Migrations Failed
- Check for syntax errors in SQL Editor
- Ensure you have proper permissions in Supabase
- Try running migrations one at a time

### Storage Bucket Creation Failed
- Check Supabase Storage is enabled in your project
- Verify you have admin access
- Try creating manually via Dashboard

### Google Cloud Vision API Errors
- Verify `GOOGLE_CLOUD_API_KEY` is set in `.env.local`
- Check API key has Vision API enabled
- Verify billing is enabled in Google Cloud Console

### OCR Not Working
- Check image quality (should be clear and readable)
- Verify image format (JPEG, PNG, or WebP)
- Check image size (max 10MB)
- Review browser console for errors

## Quick Setup Checklist

- [ ] Run database migrations (`scripts/run-gcash-migrations.sql`)
- [ ] Create storage bucket (`gcash-transactions`)
- [ ] Verify Google Cloud Vision API key in `.env.local`
- [ ] Test GCash payment flow in POS page

## Need Help?

If you encounter issues:
1. Check the browser console for errors
2. Check Supabase logs in Dashboard
3. Verify all environment variables are set correctly
4. Ensure all migrations ran successfully



