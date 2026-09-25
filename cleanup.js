const fs = require('fs');
let layout = fs.readFileSync('app/layout.tsx', 'utf8');
if (layout.includes('GlobalConfirm')) {
  layout = layout.replace("import { GlobalConfirm } from '@/components/GlobalConfirm'", "");
  layout = layout.replace("<GlobalConfirm />", "");
  fs.writeFileSync('app/layout.tsx', layout, 'utf8');
}
