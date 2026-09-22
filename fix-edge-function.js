const fs = require('fs');
let file = fs.readFileSync('supabase/functions/webauthn-clock/index.ts', 'utf8');

file = file.replace(
  `        await supabaseClient.from('employee_webauthn_credentials').insert({
          user_id: user_id,
          credential_id: isoBase64URL.fromBuffer(credentialID),
          public_key: \`\\\\x\${pubKeyHex}\`,
          counter: counter,
          device_type: credentialDeviceType,
          backed_up: credentialBackedUp
        });`,
  `        const { error } = await supabaseClient.from('employee_webauthn_credentials').insert({
          employee_id: user_id,
          credential_id: isoBase64URL.fromBuffer(credentialID),
          public_key: \`\\\\x\${pubKeyHex}\`,
          counter: counter,
          device_type: credentialDeviceType,
          backed_up: credentialBackedUp
        });
        if (error) throw new Error("Database insert failed: " + JSON.stringify(error));`
);

fs.writeFileSync('supabase/functions/webauthn-clock/index.ts', file, 'utf8');
