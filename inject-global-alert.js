const fs = require('fs');
let code = fs.readFileSync('app/layout.tsx', 'utf8');

if (!code.includes('GlobalAlert')) {
  code = code.replace(/import \{ AppLifecycle \} from '@\/components\/AppLifecycle'/, "import { AppLifecycle } from '@/components/AppLifecycle'\nimport { GlobalAlert } from '@/components/GlobalAlert'");
  code = code.replace(/<AppLifecycle \/>/, "<AppLifecycle />\n            <GlobalAlert />");
  fs.writeFileSync('app/layout.tsx', code, 'utf8');
}
