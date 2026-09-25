const fs = require('fs');
let code = fs.readFileSync('app/(shell)/pos/page.tsx', 'utf8');

code = code.replace(/alert\(result\.error \|\| 'Failed to finalize sale'\)/, "setCheckoutError(result.error || 'Failed to finalize sale')");

code = code.replace(/<button\s*onClick=\{async \(\) => \{\s*if \(\!session\) \{/, "{checkoutError && (\n  <div className=\"w-full bg-red-100 text-red-700 p-3 rounded-lg text-sm font-medium text-center border border-red-200\">\n    {checkoutError}\n  </div>\n)}\n<button\n  onClick={async () => {\n    setCheckoutError(null);\n    if (!session) {");

fs.writeFileSync('app/(shell)/pos/page.tsx', code, 'utf8');
