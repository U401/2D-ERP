/**
 * GCash Setup Automation Script
 * This script attempts to automate the setup process
 * Run with: node scripts/setup-gcash.js
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

async function createStorageBucket() {
  console.log('\n🗄️  Creating Storage Bucket...')
  
  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets()
    
    if (listError) {
      console.log('⚠️  Error listing buckets:', listError.message)
      return false
    }

    const bucketExists = buckets?.some(b => b.name === 'gcash-transactions')
    
    if (bucketExists) {
      console.log('✅ Storage bucket already exists')
      
      // Try to update it to ensure it's private
      const { error: updateError } = await supabase.storage.updateBucket('gcash-transactions', {
        public: false,
      })
      
      if (updateError) {
        console.log('⚠️  Could not update bucket settings:', updateError.message)
        console.log('   Please verify it is set to Private in Supabase Dashboard')
      } else {
        console.log('✅ Bucket is configured as Private')
      }
      return true
    }

    // Create the bucket
    console.log('Creating gcash-transactions bucket...')
    const { data, error } = await supabase.storage.createBucket('gcash-transactions', {
      public: false, // Private bucket for security
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    })

    if (error) {
      console.log('❌ Error creating bucket:', error.message)
      
      if (error.message.includes('permission') || error.message.includes('policy')) {
        console.log('\n💡 Tip: You may need to create the bucket manually in Supabase Dashboard:')
        console.log('   1. Go to Supabase Dashboard → Storage')
        console.log('   2. Click "New bucket"')
        console.log('   3. Name: gcash-transactions')
        console.log('   4. Set to Private')
        console.log('   5. Click "Create bucket"')
      }
      return false
    }

    console.log('✅ Storage bucket created successfully!')
    console.log('   Name: gcash-transactions')
    console.log('   Public: No (Private)')
    return true
  } catch (error) {
    console.log('❌ Error:', error.message)
    return false
  }
}

async function checkMigrations() {
  console.log('\n📊 Checking Database Migrations...')
  
  try {
    const { data, error } = await supabase
      .from('sales')
      .select('gcash_reference_code')
      .limit(1)

    if (error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        console.log('❌ Migrations NOT applied')
        console.log('\n📝 To apply migrations:')
        console.log('   1. Open Supabase Dashboard → SQL Editor')
        console.log('   2. Open scripts/run-gcash-migrations.sql')
        console.log('   3. Copy and paste the entire script')
        console.log('   4. Click "Run"')
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

function checkEnvironmentVariables() {
  console.log('\n🔑 Checking Environment Variables...')
  
  const googleApiKey = process.env.GOOGLE_CLOUD_API_KEY
  const googleCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS
  const googleProject = process.env.GOOGLE_CLOUD_PROJECT
  
  if (googleApiKey) {
    console.log('✅ GOOGLE_CLOUD_API_KEY is set')
    return true
  } else if (googleCredentials && googleProject) {
    console.log('✅ GOOGLE_APPLICATION_CREDENTIALS and GOOGLE_CLOUD_PROJECT are set')
    return true
  } else {
    console.log('❌ Google Cloud Vision API not configured')
    console.log('   → Add GOOGLE_CLOUD_API_KEY to .env.local')
    return false
  }
}

async function main() {
  console.log('🚀 GCash Setup Automation')
  console.log('='.repeat(50))

  // Check environment variables (warning only, not blocking)
  const envOk = checkEnvironmentVariables()
  if (!envOk) {
    console.log('\n⚠️  Google Cloud Vision API not configured yet')
    console.log('   This is needed when using GCash feature, but setup can continue')
  }

  // Try to create storage bucket
  const bucketOk = await createStorageBucket()

  // Check migrations (can't run automatically, but can check)
  const migrationsOk = await checkMigrations()

  console.log('\n' + '='.repeat(50))
  console.log('\n📋 Setup Summary:')
  
  if (migrationsOk && bucketOk && envOk) {
    console.log('✅ All automated steps completed!')
    console.log('\n🎉 GCash feature is ready to use!')
    console.log('\n💡 Next steps:')
    console.log('   1. Start your dev server: npm run dev')
    console.log('   2. Go to /pos page')
    console.log('   3. Test GCash payment flow')
  } else {
    console.log('\n⚠️  Setup Status:')
    console.log(`   Environment Variables: ${envOk ? '✅' : '❌'}`)
    console.log(`   Storage Bucket: ${bucketOk ? '✅' : '❌'}`)
    console.log(`   Database Migrations: ${migrationsOk ? '✅' : '❌'}`)
    
    if (!migrationsOk) {
      console.log('\n📝 To complete setup:')
      console.log('   1. Run database migrations in Supabase SQL Editor')
      console.log('      → Open scripts/run-gcash-migrations.sql')
      console.log('      → Copy and paste into Supabase SQL Editor')
      console.log('      → Click "Run"')
    }
    
    if (!bucketOk) {
      console.log('\n📝 To create storage bucket:')
      console.log('   → Visit /setup-gcash in your app after starting dev server')
      console.log('   → Or create manually in Supabase Dashboard')
    }
  }
}

main().catch(console.error)

