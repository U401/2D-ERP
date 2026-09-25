const fs = require('fs');
let lines = fs.readFileSync('app/(shell)/inventory/page.tsx', 'utf8').split('\n');
console.log(lines.slice(525, 580).join('\n'));
