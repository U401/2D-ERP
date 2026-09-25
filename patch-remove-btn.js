const fs = require('fs');
let code = fs.readFileSync('app/(shell)/inventory/page.tsx', 'utf8');

const targetStr = `                      <button onClick={() => { setUpdatingStock({ id: ing.id, name: ing.name, current: ing.current_stock, unit: ing.unit }); setNewStockValue('') }} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-900 text-white font-bold hover:bg-gray-800 transition-colors shadow-md active:scale-95" title="Update stock level">
                        <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                        <span>Update Stock</span>
                      </button>
                    </div>`;
                    
const replaceStr = `                      <button onClick={() => { setUpdatingStock({ id: ing.id, name: ing.name, current: ing.current_stock, unit: ing.unit }); setNewStockValue('') }} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-900 text-white font-bold hover:bg-gray-800 transition-colors shadow-md active:scale-95" title="Update stock level">
                        <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                        <span>Update Stock</span>
                      </button>
                      {userRole === 'admin' && (
                        <button onClick={() => setRemovingStock({ id: ing.id, name: ing.name, current: ing.current_stock, unit: ing.unit })} disabled={ing.current_stock === 0} className={\`p-3 rounded-xl border transition-colors shadow-sm active:scale-95 \${ing.current_stock === 0 ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed' : 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'}\`} title="Remove">
                          <span className="material-symbols-outlined">delete</span>
                        </button>
                      )}
                    </div>`;

code = code.replace(targetStr, replaceStr);
fs.writeFileSync('app/(shell)/inventory/page.tsx', code, 'utf8');
