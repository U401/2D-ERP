const fs = require('fs');
let file = fs.readFileSync('next.config.js', 'utf8');

file = file.replace(
  `output: 'standalone',`,
  `output: 'export',`
);

fs.writeFileSync('next.config.js', file, 'utf8');
