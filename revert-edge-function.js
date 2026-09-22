const fs = require('fs');
let file = fs.readFileSync('supabase/functions/webauthn-clock/index.ts', 'utf8');

file = file.replace(/employee_id/g, 'user_id');

fs.writeFileSync('supabase/functions/webauthn-clock/index.ts', file, 'utf8');
