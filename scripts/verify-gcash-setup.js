/**
 * GCash Setup Verification Script
 * Run with: node scripts/verify-gcash-setup.js
 * 
 * This script checks if:
 * 1. Database migrations are applied
 * 2. Storage bucket exists
 * 3. Environment variables are configured
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables')
  console.error('   Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkMigrations() {
  console.log('\n📊 Checking Database Migrations...')
  
  try {
    // Try to query GCash columns
    const { data, error } = await supabase
      .from('sales')
      .select('gcash_reference_code')
      .limit(1)

    if (error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        console.log('❌ Migrations NOT applied')
        console.log('   → Run scripts/run-gcash-migrations.sql in Supabase SQL Editor')
        return false
      } else {
        console.log('⚠️  Error checking migrations:', error.message)
        return false
      }
    } else {
      console.log('✅ Migrations appear to be applied')
      return true
    }
  } catch (error) {
    console.log('❌ Error:', error.message)
    return false
  }
}

async function checkStorageBucket() {
  console.log('\n🗄️  Checking Storage Bucket...')
  
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets()
    
    if (error) {
      console.log('⚠️  Error checking buckets:', error.message)
      return false
    }

    const gcashBucket = buckets?.find(b => b.name === 'gcash-transactions')
    
    if (gcashBucket) {
      console.log('✅ Storage bucket exists')
      console.log(`   Name: ${gcashBucket.name}`)
      console.log(`   Public: ${gcashBucket.public ? 'Yes' : 'No'} (should be No for security)`)
      return true
    } else {
      console.log('❌ Storage bucket NOT found')
      console.log('   → Go to /setup-gcash in your app or create manually in Supabase Dashboard')
      return false
    }
  } catch (error) {
    console.log('❌ Error:', error.message)
    return false
  }
}

function checkEnvironmentVariables() {
  console.log('\n🔑 Checking Environment Variables...')
  
  const googleApiKey = process.env.GOOGLE_CLOUD_API_KEY
  const googleCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS
  const googleProject = process.env.GOOGLE_CLOUD_PROJECT
  
  let allGood = true

  if (googleApiKey) {
    console.log('✅ GOOGLE_CLOUD_API_KEY is set')
  } else if (googleCredentials && googleProject) {
    console.log('✅ GOOGLE_APPLICATION_CREDENTIALS and GOOGLE_CLOUD_PROJECT are set')
  } else {
    console.log('❌ Google Cloud Vision API not configured')
    console.log('   → Add GOOGLE_CLOUD_API_KEY to .env.local')
    allGood = false
  }

  return allGood
}

async function main() {
  console.log('🔍 GCash Setup Verification\n')
  console.log('=' .repeat(50))

  const migrationsOk = await checkMigrations()
  const storageOk = await checkStorageBucket()
  const envOk = checkEnvironmentVariables()

  console.log('\n' + '='.repeat(50))
  console.log('\n📋 Summary:')
  
  if (migrationsOk && storageOk && envOk) {
    console.log('✅ All checks passed! GCash feature should be ready to use.')
    console.log('\n💡 Next steps:')
    console.log('   1. Start your dev server: npm run dev')
    console.log('   2. Go to /pos page')
    console.log('   3. Test GCash payment flow')
  } else {
    console.log('⚠️  Some checks failed. Please complete the setup:')
    if (!migrationsOk) {
      console.log('   - Run database migrations')
    }
    if (!storageOk) {
      console.log('   - Create storage bucket')
    }
    if (!envOk) {
      console.log('   - Configure Google Cloud Vision API')
    }
    console.log('\n📖 See GCASH_SETUP.md for detailed instructions')
  }
}

main().catch(console.error)



