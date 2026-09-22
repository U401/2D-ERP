const fs = require('fs');
let file = fs.readFileSync('supabase/functions/webauthn-clock/index.ts', 'utf8');

file = file.replace(
  `        await supabaseClient.from('employee_webauthn_credentials').insert({
          user_id: user_id,`,
  `        const { error } = await supabaseClient.from('employee_webauthn_credentials').insert({
          employee_id: user_id,`
);

file = file.replace(
  `backed_up: credentialBackedUp
        });`,
  `backed_up: credentialBackedUp
        });
        if (error) throw error;`
);

fs.writeFileSync('supabase/functions/webauthn-clock/index.ts', file, 'utf8');
