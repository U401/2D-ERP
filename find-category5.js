const fs = require('fs');
let lines = fs.readFileSync('app/(shell)/menu/page.tsx', 'utf8').split('\n');
let addModalStart = lines.findIndex(l => l.includes('id="product-category-new"'));
if (addModalStart !== -1) {
    for(let i=Math.max(0, addModalStart-10); i<Math.min(lines.length, addModalStart+10); i++) {
        console.log(`${i}: ${lines[i]}`);
    }
}
