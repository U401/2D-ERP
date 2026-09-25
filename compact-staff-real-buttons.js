const fs = require('fs');
let code = fs.readFileSync('app/(shell)/inventory/page.tsx', 'utf8');

code = code.replace(/className=\{`w-full flex items-center justify-between p-6 rounded-3xl/g, 'className={`w-full flex items-center justify-between p-4 rounded-2xl');

fs.writeFileSync('app/(shell)/inventory/page.tsx', code, 'utf8');
