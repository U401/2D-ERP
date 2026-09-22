const fs = require('fs');
let lines = fs.readFileSync('app/(shell)/payroll/page.tsx', 'utf8').split('\n');
for (let i = 620; i < 640; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
for (let i = 675; i < 695; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
