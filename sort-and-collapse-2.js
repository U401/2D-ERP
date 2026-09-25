const fs = require('fs');
let code = fs.readFileSync('app/(shell)/inventory/page.tsx', 'utf8');

// 1. Add state variables for sort and collapse
const stateRegex = /const \[viewStoreStockId, setViewStoreStockId\] = useState<string \| null>\(null\)/;
const stateReplacement = `const [viewStoreStockId, setViewStoreStockId] = useState<string | null>(null)
    const [yieldSort, setYieldSort] = useState<'name' | 'capacity'>('name')
    const [yieldSortDirection, setYieldSortDirection] = useState<'asc' | 'desc'>('asc')
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})`;

code = code.replace(stateRegex, stateReplacement);

// 2. Add Sort Dropdown next to search bar
const searchRegex = /<div className="mb-8 relative max-w-xl">[\s\S]*?<\/div>/;
const searchReplacement = `<div className="mb-8 flex flex-col sm:flex-row gap-4 max-w-2xl">
              <div className="relative flex-1">
                <span className="material-symbols-outlined icon-xl absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">search</span>
                <input className="block w-full pl-14 pr-6 py-4 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-black/5 outline-none transition-all text-lg" placeholder={userRole === 'admin' ? "Search stores or products..." : "Search products..."} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <select className="px-6 py-4 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-black/5 outline-none transition-all text-sm sm:text-base font-bold text-gray-700" value={\`\${yieldSort}-\${yieldSortDirection}\`} onChange={e => {
                const [sort, dir] = e.target.value.split('-');
                setYieldSort(sort as 'name' | 'capacity');
                setYieldSortDirection(dir as 'asc' | 'desc');
              }}>
                <option value="name-asc">Sort A-Z</option>
                <option value="name-desc">Sort Z-A</option>
                <option value="capacity-asc">Capacity: Low to High</option>
                <option value="capacity-desc">Capacity: High to Low</option>
              </select>
            </div>`;

code = code.replace(searchRegex, searchReplacement);


// 3. Update Admin Grouping renderer (do admin first, it uses `inventory.store.id`)
const adminGridRegex = /const renderGrid = \(items: ProductOrderCapacity\[\], title: string, colorClass: string\) => items\.length > 0 && \([\s\S]*?\{products\.length === 0 && <div className="text-center text-gray-400 py-12">No products found<\/div>\}\s*<\/>\s*\);\s*\}\)\(\)\}\s*<\/div>\s*<\/div>\s*\)\)\}\s*<\/div>/;

const adminGridReplacement = `const renderGrid = (items: ProductOrderCapacity[], title: string, colorClass: string, groupKey: string) => {
                          if (items.length === 0) return null;
                          
                          const isCollapsed = collapsedGroups[groupKey] || false;
                          const toggleGroup = () => setCollapsedGroups(prev => ({...prev, [groupKey]: !prev[groupKey]}));
                          
                          const sortedItems = [...items].sort((a, b) => {
                            if (yieldSort === 'name') {
                              return yieldSortDirection === 'asc' ? a.product_name.localeCompare(b.product_name) : b.product_name.localeCompare(a.product_name);
                            } else {
                              return yieldSortDirection === 'asc' ? a.can_make - b.can_make : b.can_make - a.can_make;
                            }
                          });

                          return (
                            <div>
                              <button onClick={toggleGroup} className="flex items-center gap-2 w-full text-left mb-4 group focus:outline-none">
                                <span className={\`material-symbols-outlined transition-transform duration-200 \${isCollapsed ? '-rotate-90' : ''} text-gray-400 group-hover:text-gray-900\`}>expand_more</span>
                                <h4 className={\`text-sm font-bold uppercase tracking-widest \${colorClass}\`}>{title} ({items.length})</h4>
                              </button>
                              {!isCollapsed && (
                                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] content-start gap-4">
                                  {sortedItems.map((pc: ProductOrderCapacity) => (
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
                              )}
                            </div>
                          );
                        };

                        return (
                          <>
                            {renderGrid(outOfStock, 'Out of Stock', 'text-red-600', \`\${inventory.store.id}-out\`)}
                            {renderGrid(lowStock, 'Low Stock', 'text-orange-600', \`\${inventory.store.id}-low\`)}
                            {renderGrid(inStock, 'In Stock', 'text-emerald-600', \`\${inventory.store.id}-in\`)}
                            {products.length === 0 && <div className="text-center text-gray-400 py-12">No products found</div>}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>`;

code = code.replace(adminGridRegex, adminGridReplacement);


// 4. Update Staff Grouping renderer
const staffGridRegex = /const renderGrid = \(items: ProductOrderCapacity\[\], title: string, colorClass: string\) => items\.length > 0 && \([\s\S]*?\{products\.length === 0 && <div className="text-center text-gray-400 py-12">No products found<\/div>\}\s*<\/>\s*\);\s*\}\)\(\)\}\s*<\/div>\s*<\/div>/;

const staffGridReplacement = `const renderGrid = (items: ProductOrderCapacity[], title: string, colorClass: string, groupKey: string) => {
                      if (items.length === 0) return null;
                      
                      const isCollapsed = collapsedGroups[groupKey] || false;
                      const toggleGroup = () => setCollapsedGroups(prev => ({...prev, [groupKey]: !prev[groupKey]}));
                      
                      const sortedItems = [...items].sort((a, b) => {
                        if (yieldSort === 'name') {
                          return yieldSortDirection === 'asc' ? a.product_name.localeCompare(b.product_name) : b.product_name.localeCompare(a.product_name);
                        } else {
                          return yieldSortDirection === 'asc' ? a.can_make - b.can_make : b.can_make - a.can_make;
                        }
                      });

                      return (
                        <div>
                          <button onClick={toggleGroup} className="flex items-center gap-2 w-full text-left mb-4 group focus:outline-none">
                            <span className={\`material-symbols-outlined transition-transform duration-200 \${isCollapsed ? '-rotate-90' : ''} text-gray-400 group-hover:text-gray-900\`}>expand_more</span>
                            <h4 className={\`text-sm font-bold uppercase tracking-widest \${colorClass}\`}>{title} ({items.length})</h4>
                          </button>
                          {!isCollapsed && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] content-start gap-4">
                              {sortedItems.map((pc: ProductOrderCapacity) => (
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
                          )}
                        </div>
                      );
                    };

                    return (
                      <>
                        {renderGrid(outOfStock, 'Out of Stock', 'text-red-600', 'staff-out')}
                        {renderGrid(lowStock, 'Low Stock', 'text-orange-600', 'staff-low')}
                        {renderGrid(inStock, 'In Stock', 'text-emerald-600', 'staff-in')}
                        {products.length === 0 && <div className="text-center text-gray-400 py-12">No products found</div>}
                      </>
                    );
                  })()}
                </div>
              </div>`;

code = code.replace(staffGridRegex, staffGridReplacement);

fs.writeFileSync('app/(shell)/inventory/page.tsx', code, 'utf8');
