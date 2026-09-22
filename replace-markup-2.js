const fs = require('fs');

const filePath = 'app/(shell)/inventory/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const regexOldStockTab = /\{activeTab === 'stock' && !error && \([\s\S]*?(?=\}\)\}\s*<\/div>\s*<\/main>\s*<\/div>\s*<\/div>\s*\)\s*\})/m;

const newStockTab = `{activeTab === 'stock' && !error && (
            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
              <div className="px-4 py-4 sm:px-8 sm:py-6 border-b border-gray-100 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
                  <div>
                    <div className="flex items-center gap-3 sm:gap-4">
                      <h2 className="font-bold text-gray-900 text-xl sm:text-2xl">{userRole === 'admin' ? 'All Stores Stock' : 'Store Stock'}</h2>
                      {userRole === 'admin' && <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-1 sm:gap-2 px-4 py-2 sm:px-6 sm:py-3 rounded-lg sm:rounded-xl bg-gray-900 text-white text-sm sm:text-lg font-bold hover:bg-gray-800 transition-colors shadow-sm"><span className="material-symbols-outlined text-lg sm:text-xl">add</span><span className="hidden sm:inline">Add New</span></button>}
                    </div>
                    <p className="text-sm sm:text-base text-gray-400 mt-1 sm:mt-2">Update absolute stock levels</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm sm:text-base font-semibold">
                    {outOfStockCount > 0 && <span className="inline-flex items-center gap-1 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-red-50 text-red-600">Out: {outOfStockCount}</span>}
                    {lowStockCount > 0 && <span className="inline-flex items-center gap-1 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-orange-50 text-orange-600">Low: {lowStockCount}</span>}
                    <span className="text-gray-500 text-base sm:text-lg font-medium ml-auto sm:ml-0">{processedIngredients.length} items</span>
                  </div>
                </div>

                {/* Filters Row */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
                    <input className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 outline-none transition-all text-sm md:text-base" placeholder="Search item or category..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  </div>
                  {userRole === 'admin' && (
                    <select className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 outline-none transition-all text-sm md:text-base bg-white" value={storeFilter} onChange={e => setStoreFilter(e.target.value)}>
                      <option value="all">All Stores</option>
                      {uniqueStores.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                  <select className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 outline-none transition-all text-sm md:text-base bg-white" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                    <option value="all">All Categories</option>
                    {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 outline-none transition-all text-sm md:text-base bg-white" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="all">All Status</option>
                    <option value="low">Low Stock</option>
                    <option value="out">Out of Stock</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-gray-50/50 select-none">
                      <th className="px-4 py-4 md:px-8 md:py-6 text-xs md:text-sm font-bold text-gray-500 uppercase tracking-widest cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('name')}>
                        Item <SortIcon columnKey="name" />
                      </th>
                      <th className="px-4 py-4 md:px-8 md:py-6 text-xs md:text-sm font-bold text-gray-500 uppercase tracking-widest cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('category')}>
                        Category <SortIcon columnKey="category" />
                      </th>
                      {userRole === 'admin' && (
                        <th className="px-4 py-4 md:px-8 md:py-6 text-xs md:text-sm font-bold text-gray-500 uppercase tracking-widest cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('store_name')}>
                          Store <SortIcon columnKey="store_name" />
                        </th>
                      )}
                      <th className="px-4 py-4 md:px-8 md:py-6 text-xs md:text-sm font-bold text-gray-500 uppercase tracking-widest cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('current_stock')}>
                        Current Stock <SortIcon columnKey="current_stock" />
                      </th>
                      {userRole === 'admin' && (
                        <th className="px-4 py-4 md:px-8 md:py-6 text-xs md:text-sm font-bold text-gray-500 uppercase tracking-widest text-right cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('unit_cost')}>
                          Unit Cost <SortIcon columnKey="unit_cost" />
                        </th>
                      )}
                      <th className="px-4 py-4 md:px-8 md:py-6 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedIngredients.length === 0 ? (
                      <tr><td colSpan={6} className="px-8 py-12 text-center text-gray-500 text-lg font-medium">No items match your filters.</td></tr>
                    ) : paginatedIngredients.map((ing) => (
                      <tr key={ing.id} className={\`transition-colors \${ing.current_stock === 0 ? 'bg-red-50/30 hover:bg-red-50/50' : isLowStock(ing) ? 'bg-orange-50/30 hover:bg-orange-50/50' : 'hover:bg-gray-50/50'}\`}>
                        <td className="px-4 py-4 md:px-8 md:py-6">
                          <div>
                            <p className="font-semibold text-gray-900 text-base md:text-xl flex items-center flex-wrap gap-2">
                              {ing.name}
                              {ing.current_stock === 0 && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800">Out of Stock</span>}
                              {isLowStock(ing) && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-orange-100 text-orange-800">Low Stock</span>}
                            </p>
                            <p className="text-xs md:text-sm text-gray-400 mt-1">Unit: {ing.unit}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4 md:px-8 md:py-6">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs md:text-sm font-medium bg-gray-100 text-gray-600">
                            {ing.category || 'Uncategorized'}
                          </span>
                        </td>
                        {userRole === 'admin' && <td className="px-4 py-4 md:px-8 md:py-6"><span className="text-sm md:text-lg font-medium text-gray-600">{ing.store_name || 'N/A'}</span></td>}
                        <td className="px-4 py-4 md:px-8 md:py-6"><div className="flex items-end gap-1 md:gap-2"><span className={\`text-2xl md:text-4xl font-black tracking-tight \${ing.current_stock === 0 ? 'text-red-600' : isLowStock(ing) ? 'text-orange-500' : 'text-gray-900'}\`}>{ing.current_stock.toLocaleString()}</span><span className="text-xs md:text-base text-gray-400 mb-0.5 md:mb-1">{ing.unit}</span></div></td>
                        {userRole === 'admin' && <td className="px-4 py-4 md:px-8 md:py-6 text-right"><p className="text-lg md:text-2xl font-black text-gray-900">₱{((ing.purchase_price || 0) / (ing.purchase_yield || 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></td>}
                        <td className="px-4 py-4 md:px-8 md:py-6 text-right">
                          <div className="flex justify-end gap-2 md:gap-3">
                            {userRole === 'admin' && <button onClick={() => setEditingIngredient(ing)} className="p-2 md:p-3 rounded-lg md:rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors" title="Edit"><span className="material-symbols-outlined text-base md:text-xl">edit</span></button>}
                            <button onClick={() => { setUpdatingStock({ id: ing.id, name: ing.name, current: ing.current_stock, unit: ing.unit }); setNewStockValue('') }} className="inline-flex items-center gap-1 md:gap-2 px-3 py-2 md:px-6 md:py-3 rounded-lg md:rounded-xl bg-gray-900 text-white text-sm md:text-lg font-semibold hover:bg-gray-800 transition-colors shadow-sm" title="Update stock level"><span className="material-symbols-outlined text-base md:text-xl">inventory_2</span><span className="hidden sm:inline">Update</span></button>
                            {userRole === 'admin' && <button onClick={() => setRemovingStock({ id: ing.id, name: ing.name, current: ing.current_stock, unit: ing.unit })} disabled={ing.current_stock === 0} className={\`px-3 py-2 md:px-6 md:py-3 rounded-lg md:rounded-xl text-sm md:text-lg font-semibold transition-colors \${ing.current_stock === 0 ? 'text-gray-300 cursor-not-allowed' : 'bg-red-50 text-red-600 hover:bg-red-100'}\`}>Remove</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="px-4 py-4 sm:px-8 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <p className="text-sm text-gray-500 font-medium">
                    Showing <span className="font-bold text-gray-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-gray-900">{Math.min(currentPage * itemsPerPage, processedIngredients.length)}</span> of <span className="font-bold text-gray-900">{processedIngredients.length}</span> items
                  </p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <button 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}`;

if (regexOldStockTab.test(content)) {
    content = content.replace(regexOldStockTab, newStockTab);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("Success");
} else {
    console.log("Regex didn't match anything!");
}

