const fs = require('fs');
let code = fs.readFileSync('app/(shell)/inventory/page.tsx', 'utf8');

// Staff view - Left side (Menu Products)
code = code.replace(/className="w-full flex items-center justify-between p-6 rounded-3xl/g, 'className="w-full flex items-center justify-between p-4 rounded-2xl');
code = code.replace(/<p className="font-bold text-xl truncate mb-1/g, '<p className="font-bold text-lg truncate mb-1');

// Staff view - Right side (Ingredient Analysis Header)
code = code.replace(/className="p-12 border-b border-gray-50 bg-gradient/g, 'className="p-6 md:p-8 border-b border-gray-50 bg-gradient');
code = code.replace(/text-5xl font-black/g, 'text-3xl font-black md:text-4xl'); // Title and Max Orders

// Staff view - Right side (Ingredient Cards)
code = code.replace(/<div className="p-10 flex-1 overflow-y-auto">/g, '<div className="p-6 md:p-8 flex-1 overflow-y-auto">');
code = code.replace(/className="p-6 rounded-\[2rem\] border/g, 'className="p-5 rounded-3xl border');
code = code.replace(/text-2xl leading-tight mb-2/g, 'text-xl leading-tight mb-2');
code = code.replace(/className="text-lg font-medium text-gray-600/g, 'className="text-base font-medium text-gray-600');
code = code.replace(/className="text-right shrink-0 bg-gray-50 p-4 rounded-\[1\.5rem\]/g, 'className="text-right shrink-0 bg-gray-50 p-3 rounded-2xl');
code = code.replace(/text-3xl font-black tracking-tight leading-none/g, 'text-2xl font-black tracking-tight leading-none');
code = code.replace(/<div className="pt-6 mt-2 border-t/g, '<div className="pt-4 mt-2 border-t');

fs.writeFileSync('app/(shell)/inventory/page.tsx', code, 'utf8');
