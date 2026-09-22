const fs = require('fs');
let file = fs.readFileSync('supabase/functions/webauthn-clock/index.ts', 'utf8');

file = file.replace(/.order\('created_at', \{ ascending: false \}\)/g, `.order('expires_at', { ascending: false })`);

fs.writeFileSync('supabase/functions/webauthn-clock/index.ts', file, 'utf8');
