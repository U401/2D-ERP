const fs = require('fs');
let content = fs.readFileSync('app/(shell)/menu/page.tsx', 'utf8');
let lines = content.split('\n');
let start = lines.findIndex(l => l.includes('function handleAddCategory('));
let modalStart = lines.findIndex(l => l.includes('setShowAddModal(true)'));
// Let's just search for the <select> tag for category
lines.forEach((line, i) => {
    if (line.includes('name="category"')) {
        console.log("--- MATCH ---");
        for(let j=Math.max(0, i-15); j<Math.min(lines.length, i+15); j++) {
            console.log(`${j}: ${lines[j]}`);
        }
    }
});
