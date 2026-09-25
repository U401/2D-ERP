const fs = require('fs');
let code = fs.readFileSync('app/(shell)/pos/page.tsx', 'utf8');

const match = code.match(/className="flex-1 flex flex-col min-h-0 relative"[\s\S]*?(?=\{\/\* Right Panel)/);
if (match) {
  console.log(match[0].substring(0, 1500));
} else {
  console.log('Not found');
}
