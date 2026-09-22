const fs = require('fs');
let file = fs.readFileSync('next.config.js', 'utf8');

file = file.replace(
  `reactStrictMode: true,`,
  `reactStrictMode: true,\n  turbopack: {},\n  output: 'standalone',`
);

fs.writeFileSync('next.config.js', file, 'utf8');
