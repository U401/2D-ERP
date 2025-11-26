require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
  },
})

async function closeAllSessions() {
  try {
    // First, get all open sessions
    const { data: openSessions, error: fetchError } = await supabase
      .from('sessions')
      .select('id')
      .eq('status', 'open')

    if (fetchError) {
      console.error('Error fetching open sessions:', fetchError.message)
      process.exit(1)
    }

    if (!openSessions || openSessions.length === 0) {
      console.log('No open sessions found.')
      return
    }

    console.log(`Found ${openSessions.length} open session(s). Closing...`)

    // Close all open sessions
    const { data, error } = await supabase
      .from('sessions')
      .update({ 
        status: 'closed', 
        closed_at: new Date().toISOString() 
      })
      .eq('status', 'open')

    if (error) {
      console.error('Error closing sessions:', error.message)
      process.exit(1)
    }

    console.log(`Successfully closed ${openSessions.length} session(s).`)
  } catch (error) {
    console.error('Unexpected error:', error.message)
    process.exit(1)
  }
}

closeAllSessions()
