const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1];
const supabase = createClient(url, key);

async function check() {
  const { data: prods } = await supabase.from('products').select('*');
  const { data: batches } = await supabase.from('inventory_batches').select('*');
  const { data: ingredients } = await supabase.from('ingredients').select('*');

  console.log('Products:', prods.length);
  console.log('Batches:', batches.length);
  console.log('Ingredients:', ingredients.length);
  
  if (batches.length === 0) {
     console.log('NO INVENTORY BATCHES FOUND!');
  }
}
check();
