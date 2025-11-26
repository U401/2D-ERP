require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

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

async function checkSession() {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Error checking session:', error.message)
      process.exit(1)
    }

    if (data) {
      console.log('\n✅ YES - There is an open session:')
      console.log(`   Session ID: ${data.id}`)
      console.log(`   Opened at: ${new Date(data.opened_at).toLocaleString()}`)
      console.log(`   Status: ${data.status}`)
    } else {
      console.log('\n❌ NO - There are no open sessions.')
    }
  } catch (error) {
    console.error('Unexpected error:', error.message)
    process.exit(1)
  }
}

checkSession()


