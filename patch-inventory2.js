const fs = require('fs');
let code = fs.readFileSync('app/(shell)/inventory/page.tsx', 'utf8');
const lines = code.split('\n');

// 1. Add sort dropdown
const sortDropdownLines = `                  <select className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 outline-none transition-all text-sm md:text-base bg-white" value={sortConfig ? \`\${sortConfig.key}-\${sortConfig.direction}\` : ''} onChange={e => {
                    if (!e.target.value) { setSortConfig(null); return; }
                    const [key, direction] = e.target.value.split('-');
                    setSortConfig({ key, direction: direction as 'asc' | 'desc' });
                  }}>
                    <option value="">Sort By...</option>
                    <option value="name-asc">Name (A-Z)</option>
                    <option value="name-desc">Name (Z-A)</option>
                    <option value="current_stock-asc">Stock (Low-High)</option>
                    <option value="current_stock-desc">Stock (High-Low)</option>
                    <option value="category-asc">Category</option>
                  </select>`;

lines.splice(633, 0, sortDropdownLines); // insert at line 634 (index 633)

// The table now shifted down by 10 lines. So <div className="overflow-x-auto"> is at 646.
// Let's just find the table start by string now.
code = lines.join('\n');

const tableStart = '<div className="overflow-x-auto">';
const tableStartIdx = code.lastIndexOf(tableStart);
const tableEndStr = '</table>\n              </div>';
const tableEndIdx = code.indexOf(tableEndStr, tableStartIdx) + tableEndStr.length;

if (tableStartIdx !== -1 && tableEndIdx !== -1) {
  const replacement = `<div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 mt-6">
                {paginatedIngredients.length === 0 ? (
                  <div className="col-span-full p-12 text-center text-gray-500 text-lg font-medium bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                    No items match your filters.
                  </div>
                ) : paginatedIngredients.map((ing) => (
                  <div key={ing.id} className={\`flex flex-col p-5 rounded-2xl border transition-all hover:shadow-lg \${ing.current_stock === 0 ? 'bg-red-50/20 border-red-200 shadow-sm shadow-red-100' : isLowStock(ing) ? 'bg-orange-50/20 border-orange-200 shadow-sm shadow-orange-100' : 'bg-white border-gray-200 shadow-sm'}\`}>
                    <div className="flex justify-between items-start gap-3 mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg md:text-xl font-bold text-gray-900 leading-tight truncate" title={ing.name}>{ing.name}</h3>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600">
                            {ing.category || 'Uncategorized'}
                          </span>
                          {userRole === 'admin' && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 truncate max-w-[120px]" title={ing.store_name || 'N/A'}>
                              {ing.store_name || 'N/A'}
                            </span>
                          )}
                        </div>
                      </div>
                      {ing.current_stock === 0 ? (
                        <span className="shrink-0 inline-flex items-center px-2 py-1 rounded-md text-[10px] font-black bg-red-100 text-red-800 uppercase tracking-wider border border-red-200">OUT</span>
                      ) : isLowStock(ing) ? (
                        <span className="shrink-0 inline-flex items-center px-2 py-1 rounded-md text-[10px] font-black bg-orange-100 text-orange-800 uppercase tracking-wider border border-orange-200">LOW</span>
                      ) : null}
                    </div>

                    <div className="mt-auto flex items-end justify-between bg-gray-50/50 p-3 rounded-xl border border-gray-100 mb-4">
                      <div>
                         <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-widest font-bold">Current Stock</p>
                         <div className="flex items-baseline gap-1.5">
                           <span className={\`text-3xl md:text-4xl font-black tracking-tighter leading-none \${ing.current_stock === 0 ? 'text-red-600' : isLowStock(ing) ? 'text-orange-500' : 'text-gray-900'}\`}>{ing.current_stock.toLocaleString()}</span>
                           <span className="text-sm font-bold text-gray-400">{ing.unit}</span>
                         </div>
                      </div>
                      {userRole === 'admin' && (
                        <div className="text-right">
                          <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-widest font-bold">Unit Cost</p>
                          <p className="text-xl font-black text-gray-900 leading-none">₱{((ing.purchase_price || 0) / (ing.purchase_yield || 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {userRole === 'admin' && (
                        <button onClick={() => setEditingIngredient(ing)} className="p-3 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-sm active:scale-95" title="Edit">
                          <span className="material-symbols-outlined">edit</span>
                        </button>
                      )}
                      <button onClick={() => { setUpdatingStock({ id: ing.id, name: ing.name, current: ing.current_stock, unit: ing.unit }); setNewStockValue('') }} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-900 text-white font-bold hover:bg-gray-800 transition-colors shadow-md active:scale-95" title="Update stock level">
                        <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                        <span>Update Stock</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>`;
  
  code = code.substring(0, tableStartIdx) + replacement + code.substring(tableEndIdx);
  fs.writeFileSync('app/(shell)/inventory/page.tsx', code, 'utf8');
} else {
  console.log("Could not find table!");
}

