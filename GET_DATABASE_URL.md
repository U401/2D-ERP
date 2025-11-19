# How to Get DATABASE_URL for Direct Migration

## Quick Steps:

1. **Go to Supabase Dashboard**
   - Visit: https://supabase.com/dashboard
   - Sign in to your account

2. **Navigate to Your Project**
   - Select your project (the one with URL: tbqxdcuptunwjzrbjdyv.supabase.co)

3. **Go to Settings → Database**
   - Click on "Settings" in the left sidebar
   - Click on "Database" in the settings menu

4. **Find Connection String**
   - Scroll down to "Connection string" section
   - Look for "URI" tab
   - Copy the connection string (it looks like):
     ```
     postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
     ```

5. **Add to .env.local**
   - Open `.env.local` file in your project
   - Add this line:
     ```
     DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
     ```
   - Replace `[PASSWORD]` with your actual database password
   - The password is shown in the Supabase Dashboard (you may need to click "Reveal")

6. **Run Migration**
   ```bash
   node scripts/run-migrations-direct.js
   ```

## Alternative: Use Web Interface

If you don't want to add DATABASE_URL:
1. Visit: http://localhost:3000/run-migrations
2. Click "Copy SQL"
3. Paste in Supabase SQL Editor
4. Click "Run"



