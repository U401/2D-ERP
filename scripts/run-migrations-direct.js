/**
 * Direct Migration Runner
 * This script executes the GCash migrations directly using PostgreSQL connection
 * 
 * Usage: node scripts/run-migrations-direct.js
 * 
 * Requires: DATABASE_URL environment variable in .env.local
 * Format: postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
 * 
 * You can find this in Supabase Dashboard > Settings > Database > Connection String
 */

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL

if (!databaseUrl) {
  console.error('❌ DATABASE_URL not found in .env.local')
  console.error('\nTo get your database URL:')
  console.error('1. Go to Supabase Dashboard > Settings > Database')
  console.error('2. Find "Connection string" section')
  console.error('3. Copy the URI format (starts with postgresql://)')
  console.error('4. Add to .env.local as: DATABASE_URL=postgresql://...')
  console.error('\nOr use the manual method:')
  console.error('  → Visit http://localhost:3000/run-migrations')
  console.error('  → Copy SQL and run in Supabase SQL Editor')
  process.exit(1)
}

async function runMigrations() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  })

  try {
    console.log('🔌 Connecting to database...')
    await client.connect()
    console.log('✅ Connected!\n')

    // Read migration SQL
    const migrationPath = path.join(__dirname, 'run-gcash-migrations.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

    console.log('📝 Running migrations...')
    console.log('='.repeat(50))

    // Split by semicolons and execute each statement
    // But we need to be careful with functions and DO blocks
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    // Actually, let's execute the whole thing as one transaction
    try {
      await client.query('BEGIN')
      await client.query(migrationSQL)
      await client.query('COMMIT')
      
      console.log('✅ Migrations executed successfully!')
      console.log('\n📋 Summary:')
      console.log('  ✓ Added GCash transaction fields to sales table')
      console.log('  ✓ Updated payment_method constraint')
      console.log('  ✓ Created indexes')
      console.log('  ✓ Updated finalize_sale function')
      console.log('  ✓ Created storage policies')
      
      return true
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    
    if (error.message.includes('already exists')) {
      console.log('\n⚠️  Some objects already exist. This is usually fine.')
      console.log('   The migrations use IF NOT EXISTS, so they should be safe to run again.')
    } else if (error.message.includes('permission') || error.message.includes('denied')) {
      console.log('\n⚠️  Permission error. Make sure you\'re using the correct database credentials.')
    } else {
      console.log('\n💡 Tip: You can also run migrations manually:')
      console.log('   1. Visit http://localhost:3000/run-migrations')
      console.log('   2. Copy the SQL script')
      console.log('   3. Run in Supabase SQL Editor')
    }
    
    return false
  } finally {
    await client.end()
    console.log('\n🔌 Database connection closed')
  }
}

runMigrations()
  .then(success => {
    if (success) {
      console.log('\n🎉 Setup complete! GCash feature is ready to use.')
      process.exit(0)
    } else {
      process.exit(1)
    }
  })
  .catch(error => {
    console.error('Unexpected error:', error)
    process.exit(1)
  })



