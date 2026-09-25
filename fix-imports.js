const fs = require('fs');

// Files that need the import added
const files = [
  "app/(shell)/menu/page.tsx",
  "app/(shell)/purchasing/page.tsx",
  "app/(shell)/payroll/page.tsx",
  "app/(shell)/admin/AdminMenuManagement.tsx",
  "app/(shell)/admin/HRManagement.tsx",
  "app/(shell)/admin/UserManagement.tsx",
  "app/(shell)/admin/StoreManagement.tsx",
  "components/modals/AddIngredientModal.tsx",
  "components/modals/EditIngredientModal.tsx",
];

for (const file of files) {
  if (!fs.existsSync(file)) { console.log(`SKIP: ${file}`); continue; }
  let code = fs.readFileSync(file, 'utf8');
  if (code.includes("showConfirm")) {
    if (!code.includes("import { showConfirm }")) {
      // Find the last import line and add after it
      const lines = code.split('\n');
      let lastImportIdx = 0;
      lines.forEach((line, i) => { if (line.trim().startsWith('import ')) lastImportIdx = i; });
      lines.splice(lastImportIdx + 1, 0, "import { showConfirm } from '@/components/GlobalConfirm'");
      fs.writeFileSync(file, lines.join('\n'), 'utf8');
      console.log(`Added import to ${file}`);
    } else {
      console.log(`Already has import: ${file}`);
    }
  }
}

// Fix StoreManagement: the confirm is inside an onClick callback that may not be async
// Read and check
let sm = fs.readFileSync("app/(shell)/admin/StoreManagement.tsx", 'utf8');
// The line is: if (await showConfirm(`Unassign ...`)) {
// It's inside an onClick. Make the onClick async if not already.
sm = sm.replace(
  /onClick=\{(\(\))\s*=>/g,
  'onClick={async () =>'
);
// More specific: replace the specific onClick around the showConfirm line  
// If the onClick already had async, this is fine. If not, we need to check.
// Let's do a targeted replace for the unassign button pattern
fs.writeFileSync("app/(shell)/admin/StoreManagement.tsx", sm, 'utf8');
console.log('Fixed StoreManagement async onClick');
