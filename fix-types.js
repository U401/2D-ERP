const fs = require('fs');
let code = fs.readFileSync('app/(shell)/inventory/page.tsx', 'utf8');

// Replace admin renderGrid
const adminRegex = /const renderGrid = \(items, title, colorClass\) => items\.length > 0 && \([\s\S]*?\{items\.map\(\(pc\) => \(/g;
const adminRepl = `const renderGrid = (items: ProductOrderCapacity[], title: string, colorClass: string) => items.length > 0 && (
                          <div>
                            <h4 className={\`text-sm font-bold uppercase tracking-widest mb-4 \${colorClass}\`}>{title} ({items.length})</h4>
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] content-start gap-4">
                              {items.map((pc: ProductOrderCapacity) => (`
code = code.replace(adminRegex, adminRepl);

// Replace staff renderGrid
const staffRegex = /const renderGrid = \(items, title, colorClass\) => items\.length > 0 && \([\s\S]*?\{items\.map\(\(pc\) => \(/g;
const staffRepl = `const renderGrid = (items: ProductOrderCapacity[], title: string, colorClass: string) => items.length > 0 && (
                      <div>
                        <h4 className={\`text-sm font-bold uppercase tracking-widest mb-4 \${colorClass}\`}>{title} ({items.length})</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] content-start gap-4">
                          {items.map((pc: ProductOrderCapacity) => (`
code = code.replace(staffRegex, staffRepl);

fs.writeFileSync('app/(shell)/inventory/page.tsx', code, 'utf8');
