const fs = require('fs');
let code = fs.readFileSync('app/(shell)/inventory/page.tsx', 'utf8');

const regex = /\s*\/\/ For staff view, auto-select the first product if none selected\s*useEffect\(\(\) => \{\s*if \(userRole !== 'admin' && filteredStores\.length > 0 && !selectedProduct && activeTab === 'inventory'\) \{\s*const firstStore = filteredStores\[0\];\s*if \(firstStore\.productCapacities\.length > 0\) \{\s*handleProductClick\(firstStore\.store\.id, firstStore\.productCapacities\[0\]\);\s*\}\s*\}\s*\}, \[userRole, filteredStores\.length, !!selectedProduct, activeTab\]\);/g;

code = code.replace(regex, '');

fs.writeFileSync('app/(shell)/inventory/page.tsx', code, 'utf8');
