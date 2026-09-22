const fs = require('fs');
let file = fs.readFileSync('supabase/functions/webauthn-clock/index.ts', 'utf8');

file = file.replace(/user_id: user_id/g, 'employee_id: user_id');

fs.writeFileSync('supabase/functions/webauthn-clock/index.ts', file, 'utf8');
