const fs = require('fs');
let code = fs.readFileSync('app/(shell)/pos/page.tsx', 'utf8');

code = code.replace(/aria-label="Decrease quantity"\s*>\s*−\s*<\/button>/, 'aria-label="Decrease quantity">\n                              <span className="material-symbols-outlined">remove</span>\n                            </button>');

code = code.replace(/aria-label="Increase quantity"\s*>\s*\+\s*<\/button>/, 'aria-label="Increase quantity">\n                              <span className="material-symbols-outlined">add</span>\n                            </button>');

fs.writeFileSync('app/(shell)/pos/page.tsx', code, 'utf8');
