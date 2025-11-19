/**
 * Automated Migration Helper
 * This script provides the easiest way to run migrations
 */

const { exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

async function main() {
  console.log('🚀 GCash Migration Automation Helper\n')
  console.log('='.repeat(50))

  // Check for DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL

  if (databaseUrl) {
    console.log('✅ DATABASE_URL found!')
    console.log('Running migrations directly...\n')
    
    try {
      const { stdout, stderr } = await execAsync('node scripts/run-migrations-direct.js')
      console.log(stdout)
      if (stderr) console.error(stderr)
      return
    } catch (error) {
      console.error('Direct execution failed:', error.message)
      console.log('\nFalling back to manual method...\n')
    }
  }

  // Manual method - open browser and provide instructions
  console.log('📋 Manual Migration Method\n')
  console.log('Opening migration helper page in your browser...\n')

  const migrationPage = 'http://localhost:3000/run-migrations'
  
  // Try to open browser (cross-platform)
  const platform = process.platform
  let openCommand

  if (platform === 'win32') {
    openCommand = `start ${migrationPage}`
  } else if (platform === 'darwin') {
    openCommand = `open ${migrationPage}`
  } else {
    openCommand = `xdg-open ${migrationPage}`
  }

  try {
    await execAsync(openCommand)
    console.log('✅ Browser opened!\n')
  } catch (error) {
    console.log('⚠️  Could not open browser automatically')
    console.log(`   Please visit: ${migrationPage}\n`)
  }

  console.log('📝 Next Steps:')
  console.log('='.repeat(50))
  console.log('1. On the page that opened, click "Copy SQL" button')
  console.log('2. Go to: https://supabase.com/dashboard')
  console.log('3. Select your project')
  console.log('4. Click "SQL Editor" in left sidebar')
  console.log('5. Click "New Query"')
  console.log('6. Paste the SQL (Ctrl+V)')
  console.log('7. Click "Run" button\n')
  console.log('✅ After running, verify at: http://localhost:3000/setup-gcash\n')
}

main().catch(console.error)



