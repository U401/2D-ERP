require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('\n=== Supabase API Keys Verification ===\n');

// Check if variables exist
if (!supabaseUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL is missing');
} else {
  console.log('✅ NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl.substring(0, 30) + '...');
}

if (!supabaseAnonKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY is missing');
} else {
  console.log('✅ NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey.substring(0, 20) + '...');
}

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is missing');
} else {
  console.log('✅ SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey.substring(0, 20) + '...');
}

// Test connection
if (supabaseUrl && supabaseAnonKey) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  
  console.log('\n=== Testing Connection ===\n');
  
  supabase
    .from('sessions')
    .select('count')
    .limit(1)
    .then(({ data, error }) => {
      if (error) {
        console.error('❌ Connection test failed:', error.message);
        console.error('   Error code:', error.code);
        console.error('   Error details:', error.details);
        if (error.code === 'PGRST301' || error.message.includes('406')) {
          console.error('\n⚠️  This might be a CORS or API configuration issue.');
          console.error('   Check your Supabase Dashboard > Settings > API');
        }
      } else {
        console.log('✅ Connection test successful!');
        console.log('   Supabase API is accessible.');
      }
    })
    .catch((error) => {
      console.error('❌ Connection test error:', error.message);
    });
}

console.log('\n');


