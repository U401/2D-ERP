# Quick Start - Run GCash Migrations

## Step-by-Step Instructions

### 1. Access the Helper Page

The dev server should be running. Open your browser and go to:

**http://localhost:3000/run-migrations**

### 2. Copy the SQL Script

1. On the page, you'll see the complete SQL migration script
2. Click the **"Copy SQL"** button (top right)
3. The entire script will be copied to your clipboard

### 3. Run in Supabase SQL Editor

1. Open a new tab and go to your **Supabase Dashboard**
2. Navigate to **SQL Editor** (left sidebar)
3. Click **"New Query"** button
4. Paste the SQL script (Ctrl+V or right-click → Paste)
5. Click **"Run"** button (or press Ctrl+Enter)
6. Wait for the success message

### 4. Verify Setup

After running the migrations:

1. Go back to: **http://localhost:3000/setup-gcash**
2. Click **"Check Migrations Status"** button
3. You should see: ✅ Migrations appear to be applied successfully!

## Alternative: Direct SQL File

If you prefer, you can also:
1. Open `scripts/run-gcash-migrations.sql` in your code editor
2. Copy all contents
3. Paste into Supabase SQL Editor
4. Run

## Troubleshooting

- **Server not running?** Run `npm run dev` in terminal
- **Can't access page?** Make sure server is on port 3000
- **SQL errors?** Check Supabase logs for details
- **Migrations already run?** That's fine - script uses `IF NOT EXISTS` so it's safe to run again

## Next Steps After Migrations

Once migrations are complete:
1. ✅ Storage bucket: Already created
2. ✅ Database migrations: Just completed
3. ✅ Google Cloud API: Already configured
4. 🎉 **GCash feature is ready!**

Test it by going to `/pos` and selecting GCash payment method.



