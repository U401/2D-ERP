const fs = require('fs');
let lines = fs.readFileSync('app/(shell)/menu/page.tsx', 'utf8').split('\n');
let addModalStart = lines.findIndex(l => l.includes('Add a New Product') || l.includes('Edit Product') || l.includes('formData.name'));
if (addModalStart !== -1) {
    for(let i=Math.max(0, addModalStart-5); i<Math.min(lines.length, addModalStart+80); i++) {
        console.log(`${i}: ${lines[i]}`);
    }
}
