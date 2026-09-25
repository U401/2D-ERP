const fs = require('fs');
let code = fs.readFileSync('app/(shell)/inventory/page.tsx', 'utf8');

// For Staff View
const staffGridRegex = /<div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin">[\s\S]*?<\/div>\s*<\/div>/;

const staffGridReplacement = `<div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin space-y-8">
                  {(() => {
                    const products = filteredStores[0]?.productCapacities.filter(pc => !searchQuery || pc.product_name.toLowerCase().includes(searchQuery.toLowerCase())) || [];
                    const outOfStock = products.filter(pc => pc.can_make === 0);
                    const lowStock = products.filter(pc => pc.can_make > 0 && pc.can_make < 10);
                    const inStock = products.filter(pc => pc.can_make >= 10);
                    
                    const renderGrid = (items, title, colorClass) => items.length > 0 && (
                      <div>
                        <h4 className={\`text-sm font-bold uppercase tracking-widest mb-4 \${colorClass}\`}>{title} ({items.length})</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] content-start gap-4">
                          {items.map((pc) => (
                            <button key={pc.product_id} onClick={() => handleProductClick(filteredStores[0].store.id, pc)} className="flex flex-col gap-3 pb-4 cursor-pointer rounded-2xl bg-white border border-gray-200 hover:bg-gray-50 shadow-sm hover:shadow-lg active:scale-95 p-3 transition-all text-left">
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
                      </div>
                    );

                    return (
                      <>
                        {renderGrid(outOfStock, 'Out of Stock', 'text-red-600')}
                        {renderGrid(lowStock, 'Low Stock', 'text-orange-600')}
                        {renderGrid(inStock, 'In Stock', 'text-emerald-600')}
                        {products.length === 0 && <div className="text-center text-gray-400 py-12">No products found</div>}
                      </>
                    );
                  })()}
                </div>
              </div>`;

code = code.replace(staffGridRegex, staffGridReplacement);

// For Admin View
const adminGridRegex = /<div className="p-3 sm:p-6 max-h-\[500px\] overflow-y-auto scrollbar-thin">[\s\S]*?<\/div>\s*<\/div>/;

const adminGridReplacement = `<div className="p-3 sm:p-6 max-h-[500px] overflow-y-auto scrollbar-thin space-y-8">
                      {(() => {
                        const products = inventory.productCapacities.filter(pc => !searchQuery || pc.product_name.toLowerCase().includes(searchQuery.toLowerCase()) || inventory.store.name.toLowerCase().includes(searchQuery.toLowerCase()));
                        const outOfStock = products.filter(pc => pc.can_make === 0);
                        const lowStock = products.filter(pc => pc.can_make > 0 && pc.can_make < 10);
                        const inStock = products.filter(pc => pc.can_make >= 10);
                        
                        const renderGrid = (items, title, colorClass) => items.length > 0 && (
                          <div>
                            <h4 className={\`text-sm font-bold uppercase tracking-widest mb-4 \${colorClass}\`}>{title} ({items.length})</h4>
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] content-start gap-4">
                              {items.map((pc) => (
                                <button key={pc.product_id} onClick={() => handleProductClick(inventory.store.id, pc)} className="flex flex-col gap-3 pb-4 cursor-pointer rounded-2xl bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 p-3 transition-all text-left shadow-sm hover:shadow-lg">
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
                          </div>
                        );

                        return (
                          <>
                            {renderGrid(outOfStock, 'Out of Stock', 'text-red-600')}
                            {renderGrid(lowStock, 'Low Stock', 'text-orange-600')}
                            {renderGrid(inStock, 'In Stock', 'text-emerald-600')}
                            {products.length === 0 && <div className="text-center text-gray-400 py-12">No products found</div>}
                          </>
                        );
                      })()}
                    </div>`;
                    
code = code.replace(adminGridRegex, adminGridReplacement);

fs.writeFileSync('app/(shell)/inventory/page.tsx', code, 'utf8');
