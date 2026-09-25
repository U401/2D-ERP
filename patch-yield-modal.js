const fs = require('fs');
let code = fs.readFileSync('app/(shell)/inventory/page.tsx', 'utf8');

// 1. Remove the auto-select useEffect
const useEffectAutoSelect = `    // For staff view, auto-select the first product if none selected
    useEffect(() => {
      if (userRole !== 'admin' && filteredStores.length > 0 && !selectedProduct && activeTab === 'inventory') {
        const firstStore = filteredStores[0];
        if (firstStore.productCapacities.length > 0) {
          handleProductClick(firstStore.store.id, firstStore.productCapacities[0]);
        }
      }
    }, [userRole, filteredStores.length, !!selectedProduct, activeTab]);`;
code = code.replace(useEffectAutoSelect, '');

// 2. Replace the staff split view
const staffSplitViewRegex = /<div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-\[700px\]">[\s\S]*?Choose from the left to analyze yield\.<\/p><\/div>\}[\s\S]*?<\/div>\s*<\/div>/g;

const staffFullScreenGrid = `<div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[700px]">
                <div className="p-6 border-b border-gray-50 flex items-center justify-between"><h3 className="font-bold text-gray-900 text-xl tracking-tight">Menu Products</h3><span className="text-sm font-bold text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg">{filteredStores[0]?.productCapacities.length} items</span></div>
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] content-start gap-4">
                      {filteredStores[0]?.productCapacities.filter(pc => !searchQuery || pc.product_name.toLowerCase().includes(searchQuery.toLowerCase())).map((pc) => (
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
              </div>`;

code = code.replace(staffSplitViewRegex, staffFullScreenGrid);


// 3. Replace the Admin modal with the unified detailed Modal
const adminModalRegex = /\{selectedProduct && userRole === 'admin' && \([\s\S]*?<\/div>\s*<\/div>\s*\)\}/g;

const unifiedModal = `{selectedProduct && (
          <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4 sm:p-6">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-5 md:px-8 md:py-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-br from-white to-gray-50/50">
                <div>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Ingredient Analysis</p>
                  <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">{selectedProduct.product.product_name}</h2>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div className="hidden sm:block">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Max Orders</p>
                    <p className={\`text-2xl font-black tracking-tighter leading-none \${selectedProduct.product.can_make === 0 ? 'text-red-600' : 'text-gray-900'}\`}>{selectedProduct.product.can_make}</p>
                  </div>
                  <button onClick={() => { setSelectedProduct(null); setViewStoreStockId(null); }} className="p-2 sm:p-3 bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 rounded-xl transition-colors">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-gray-50/30">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-start">
                  {selectedProduct.ingredients.length === 0 ? (
                    <div className="col-span-full py-16 text-center text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200">
                      <p className="text-xl font-bold">No Recipe Found</p>
                    </div>
                  ) : (
                    selectedProduct.ingredients.map((ing) => (
                      <div key={ing.ingredient_id} className="p-5 rounded-3xl border border-gray-200 bg-white shadow-sm">
                        <div className="flex justify-between items-start gap-4 mb-5">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-black text-gray-900 text-lg leading-tight mb-2">{ing.ingredient_name}</h4>
                            <div className="flex flex-col gap-1">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">Usage</p>
                              <p className="text-sm font-medium text-gray-600">
                                <span className="text-gray-900 font-bold">{ing.required_quantity}{ing.unit}</span> / order
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0 bg-gray-50 p-2.5 rounded-2xl border border-gray-100">
                            <p className={\`text-xl font-black tracking-tight leading-none mb-1 \${ing.current_stock === 0 ? 'text-red-600' : 'text-gray-900'}\`}>{ing.current_stock}</p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{ing.unit} stock</p>
                          </div>
                        </div>
                        <div className="pt-3 border-t border-gray-100">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Yield Capacity</span>
                              <span className={\`text-xs font-black px-2.5 py-1 rounded-lg \${ing.can_make === 0 ? 'bg-red-100 text-red-600' : ing.can_make < 10 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}\`}>
                                {ing.can_make} orders left
                              </span>
                            </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}`;

code = code.replace(adminModalRegex, unifiedModal);
fs.writeFileSync('app/(shell)/inventory/page.tsx', code, 'utf8');
