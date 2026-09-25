const fs = require('fs');

// Fix files where import landed inside a multi-line import block
const fixes = [
  "app/(shell)/payroll/page.tsx",
  "app/(shell)/admin/StoreManagement.tsx",
];

for (const file of fixes) {
  let code = fs.readFileSync(file, 'utf8');
  // Remove the badly placed import line
  code = code.replace(/\nimport \{ showConfirm \} from '@\/components\/GlobalConfirm'\n/g, '\n');
  // Find the end of the 'use client' + all imports block
  // Insert after the LAST } from '...' line
  const lines = code.split('\n');
  let lastImportEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('import ') || 
        (line.trim().startsWith('}') && i > 0 && lines[i-1].trim().includes('from '))) {
      lastImportEnd = i;
    }
    // Detect end of import block - first non-import, non-empty, non-comment line
    if (i > 2 && !line.trim().startsWith('import ') && !line.trim().startsWith('}') && !line.trim().startsWith('//') && !line.trim().startsWith('*') && line.trim() !== '' && line.trim() !== "'use client'") {
      if (lastImportEnd > 0 && i > lastImportEnd) break;
    }
  }
  
  // Also remove if placed at start of a multi-line import  
  // Instead: find first blank line after all imports
  let inImports = true;
  let insertAfter = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "'use client'" || t === '"use client"') continue;
    if (t === '') {
      if (inImports && insertAfter > 0) {
        // We hit a blank line after imports
        break;
      }
      continue;
    }
    if (t.startsWith('import ') || t.startsWith('}')) {
      insertAfter = i;
      inImports = true;
    } else {
      inImports = false;
    }
  }
  
  lines.splice(insertAfter + 1, 0, "import { showConfirm } from '@/components/GlobalConfirm'");
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  console.log(`Fixed ${file}`);
}
