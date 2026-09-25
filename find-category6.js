const fs = require('fs');
let lines = fs.readFileSync('app/(shell)/menu/page.tsx', 'utf8').split('\n');
let addModalStart = lines.findIndex(l => l.includes('Add New Category'));
if (addModalStart !== -1) {
    for(let i=Math.max(0, addModalStart-3); i<Math.min(lines.length, addModalStart+35); i++) {
        console.log(`${i}: ${lines[i]}`);
    }
}
