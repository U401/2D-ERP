const fs = require('fs');
let code = fs.readFileSync('app/(shell)/inventory/page.tsx', 'utf8');

// Replace Admin view product list
const adminListRegex = /<div className="p-3 sm:p-6 max-h-\[500px\] overflow-y-auto scrollbar-thin space-y-3 sm:space-y-4">[\s\S]*?<\/button>\s*\)\)\}\s*<\/div>/g;

const adminReplacement = `<div className="p-3 sm:p-6 max-h-[500px] overflow-y-auto scrollbar-thin">
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] content-start gap-4">
                        {inventory.productCapacities
                          .filter(pc => !searchQuery || pc.product_name.toLowerCase().includes(searchQuery.toLowerCase()) || inventory.store.name.toLowerCase().includes(searchQuery.toLowerCase()))
                          .map((pc) => (
                            <button 
                              key={pc.product_id} 
                              onClick={() => handleProductClick(inventory.store.id, pc)}
                              className="flex flex-col gap-3 pb-4 cursor-pointer rounded-2xl bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 p-3 transition-all text-left shadow-sm hover:shadow-lg"
                            >
                              <div className="w-full aspect-square bg-center bg-no-repeat bg-cover rounded-xl bg-gradient-to-br from-amber-800 to-amber-600 shrink-0"></div>
                              <div className="flex flex-col px-1">
                                <p className="text-gray-900 text-sm md:text-base font-bold leading-tight line-clamp-2">
                                  {pc.product_name}
                                </p>
                                <p className={\`text-sm font-bold mt-0.5 \${pc.can_make === 0 ? 'text-red-600' : 'text-emerald-700'}\`}>
                                  {pc.can_make} {pc.can_make === 1 ? 'order' : 'orders'}
                                </p>
                                {pc.can_make === 0 && (
                                  <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider font-bold truncate">
                                    Limit: {pc.limiting_ingredient}
                                  </p>
                                )}
                              </div>
                            </button>
                          ))}
                      </div>
                    </div>`;

code = code.replace(adminListRegex, adminReplacement);


// Replace Staff view product list
const staffListRegex = /<div className="flex-1 overflow-y-auto p-6 scrollbar-thin max-h-\[600px\] space-y-3">[\s\S]*?<\/button>\s*\)\)\}\s*<\/div>/g;

const staffReplacement = `<div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin max-h-[600px]">
                      <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] content-start gap-4">
                        {filteredStores[0]?.productCapacities.filter(pc => !searchQuery || pc.product_name.toLowerCase().includes(searchQuery.toLowerCase())).map((pc) => (
                          <button key={pc.product_id} onClick={() => handleProductClick(filteredStores[0].store.id, pc)} className={\`flex flex-col gap-3 pb-4 cursor-pointer rounded-2xl bg-white border \${selectedProduct?.product.product_id === pc.product_id ? 'border-gray-900 ring-2 ring-gray-900 shadow-md' : 'border-gray-200 hover:bg-gray-50 shadow-sm hover:shadow-lg'} active:scale-95 p-3 transition-all text-left\`}>
                            <div className="w-full aspect-square bg-center bg-no-repeat bg-cover rounded-xl bg-gradient-to-br from-amber-800 to-amber-600 shrink-0"></div>
                            <div className="flex flex-col px-1">
                                <p className="text-gray-900 text-sm md:text-base font-bold leading-tight line-clamp-2">
                                  {pc.product_name}
                                </p>
                                <p className={\`text-sm font-bold mt-0.5 \${pc.can_make === 0 ? 'text-red-600' : 'text-emerald-700'}\`}>
                                  {pc.can_make} {pc.can_make === 1 ? 'order' : 'orders'}
                                </p>
                                {pc.can_make === 0 && (
                                  <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider font-bold truncate w-[100px]">
                                    Limit: {pc.limiting_ingredient}
                                  </p>
                                )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>`;
                    
code = code.replace(staffListRegex, staffReplacement);

fs.writeFileSync('app/(shell)/inventory/page.tsx', code, 'utf8');
