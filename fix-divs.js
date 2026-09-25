const fs = require('fs');
let code = fs.readFileSync('app/(shell)/inventory/page.tsx', 'utf8');

const regex = /<\/div>\s*<\/div>\s*<\/div>\s*\)\s*\)\}/g;
const replacement = `    </div>
              </div>
          )
        )}`;

code = code.replace(regex, replacement);

fs.writeFileSync('app/(shell)/inventory/page.tsx', code, 'utf8');
