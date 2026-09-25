require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
  },
})

async function applyMigration() {
  try {
    // Read migration SQL
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '0013_fix_finalize_sale_ambiguity.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

    console.log('Applying migration 0013_fix_finalize_sale_ambiguity.sql...')
    console.log('Migration SQL:')
    console.log(migrationSQL)
    console.log('\n---\n')

    // Execute migration using RPC (we'll use direct SQL execution via pg if available)
    // Since Supabase client doesn't support raw SQL, we'll use the service role to execute
    // via a custom RPC or we can use pg client
    
    // For now, let's try using the Supabase REST API or check if we can use pg
    const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
    
    if (databaseUrl) {
      const { Client } = require('pg')
      const client = new Client({
        connectionString: databaseUrl,
        ssl: {
          rejectUnauthorized: false
        }
      })

      await client.connect()
      await client.query('BEGIN')
      await client.query(migrationSQL)
      await client.query('COMMIT')
      await client.end()

      console.log('✅ Migration applied successfully!')
    } else {
      console.log('⚠️  DATABASE_URL not found. Please run this migration manually:')
      console.log('\n1. Go to Supabase Dashboard > SQL Editor')
      console.log('2. Copy and paste the SQL from: supabase/migrations/0013_fix_finalize_sale_ambiguity.sql')
      console.log('3. Click "Run"')
    }
  } catch (error) {
    console.error('❌ Error applying migration:', error.message)
    if (error.message.includes('does not exist')) {
      console.log('\n⚠️  Note: Some functions may not exist (this is okay if they were already removed)')
      console.log('The migration should still work. Please verify manually.')
    }
    process.exit(1)
  }
}

applyMigration()
