const fs = require('fs');
let lines = fs.readFileSync('app/(shell)/menu/page.tsx', 'utf8').split('\n');
lines.forEach((line, i) => {
    if (line.includes('<select') && line.includes('category')) {
        console.log("--- MATCH ---");
        for(let j=Math.max(0, i-5); j<Math.min(lines.length, i+15); j++) {
            console.log(`${j}: ${lines[j]}`);
        }
    }
});
