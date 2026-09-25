const fs = require('fs');
let code = fs.readFileSync('app/(shell)/pos/page.tsx', 'utf8');

const regex = /\s*\/\/ Default to the first category if none selected[\s\S]*?setSelectedCategory\(cats\[0\] as string\)\s*\}/g;

code = code.replace(regex, '');

fs.writeFileSync('app/(shell)/pos/page.tsx', code, 'utf8');
