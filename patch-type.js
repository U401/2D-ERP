const fs = require('fs');
let code = fs.readFileSync('app/(shell)/pos/page.tsx', 'utf8');

code = code.replace(
  /const target = e\.target;\s*target\.style\.display = 'none';\s*target\.nextElementSibling\?\.classList\.remove\('hidden'\);/g,
  `const target = e.target as HTMLImageElement;\n                             target.style.display = 'none';\n                             target.nextElementSibling?.classList.remove('hidden');`
);

fs.writeFileSync('app/(shell)/pos/page.tsx', code, 'utf8');
