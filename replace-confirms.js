const fs = require('fs');

const files = [
  'app/(shell)/layout.tsx',
  'app/(shell)/admin/HRManagement.tsx',
  'app/(shell)/admin/UserManagement.tsx',
  'app/(shell)/admin/StoreManagement.tsx',
  'app/(shell)/admin/AdminMenuManagement.tsx',
  'app/(shell)/payroll/page.tsx',
  'app/(shell)/purchasing/page.tsx',
  'app/(shell)/menu/page.tsx',
  'components/modals/EditIngredientModal.tsx',
  'components/modals/AddIngredientModal.tsx'
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(/!confirm\((.*?)\)/g, '!(await window.customConfirm($1))');
    code = code.replace(/if\s*\(confirm\((.*?)\)\)/g, 'if (await window.customConfirm($1))');
    fs.writeFileSync(file, code, 'utf8');
  }
}

// reinject GlobalConfirm
let layout = fs.readFileSync('app/layout.tsx', 'utf8');
if (!layout.includes('GlobalConfirm')) {
  layout = layout.replace(/import \{ GlobalAlert \} from '@\/components\/GlobalAlert'/, "import { GlobalAlert } from '@/components/GlobalAlert'\nimport { GlobalConfirm } from '@/components/GlobalConfirm'");
  layout = layout.replace(/<GlobalAlert \/>/, "<GlobalAlert />\n            <GlobalConfirm />");
  fs.writeFileSync('app/layout.tsx', layout, 'utf8');
}
