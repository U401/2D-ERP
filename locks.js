const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1];
const supabase = createClient(url, key);

async function checkLocks() {
  const { data, error } = await supabase.rpc('execute_sql', { sql: 'SELECT * FROM pg_locks WHERE NOT granted;' });
  console.log('Locks:', data, error);
}
checkLocks();
