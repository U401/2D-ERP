const fs = require('fs');
let code = fs.readFileSync('app/layout.tsx', 'utf8');

if (!code.includes('GlobalConfirm')) {
  code = code.replace(/import \{ GlobalAlert \} from '@\/components\/GlobalAlert'/, "import { GlobalAlert } from '@/components/GlobalAlert'\nimport { GlobalConfirm } from '@/components/GlobalConfirm'");
  code = code.replace(/<GlobalAlert \/>/, "<GlobalAlert />\n            <GlobalConfirm />");
  fs.writeFileSync('app/layout.tsx', code, 'utf8');
}
