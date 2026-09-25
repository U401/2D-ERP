const fs = require('fs');
let lines = fs.readFileSync('app/(shell)/menu/page.tsx', 'utf8').split('\n');
let addModalStart = lines.findIndex(l => l.includes('Add New Product') || l.includes('Add Product'));
if (addModalStart !== -1) {
    for(let i=Math.max(0, addModalStart-5); i<Math.min(lines.length, addModalStart+50); i++) {
        console.log(`${i}: ${lines[i]}`);
    }
}
