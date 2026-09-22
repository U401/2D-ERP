const fs = require('fs');
const args = {
  project_id: 'qztfnthdkcqlguqpiqav',
  name: 'webauthn-clock',
  entrypoint_path: 'index.ts',
  verify_jwt: false,
  files: [{
    name: 'index.ts',
    content: fs.readFileSync('supabase/functions/webauthn-clock/index.ts', 'utf8')
  }]
};
console.log(JSON.stringify(args));
