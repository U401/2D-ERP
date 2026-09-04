'use client'

import { useEffect, useState, useMemo } from 'react'
import { getFoodCostingData, updateProductPrice, ProductCostData } from '@/app/actions/costing'
import { updateIngredient } from '@/app/actions/inventory'

export default function FoodCostingPage() {
  const [data, setData] = useState<ProductCostData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<ProductCostData | null>(null)
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [editingPriceValue, setEditingPriceValue] = useState<string>('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null)
  const [editIngredientName, setEditIngredientName] = useState('')
  const [editIngredientCost, setEditIngredientCost] = useState('')
  const [editIngredientYield, setEditIngredientYield] = useState('')

  // Package Purchase Calculator state
  const [pkgPrice, setPkgPrice] = useState('')
  const [pkgQty, setPkgQty] = useState('')
  const [pkgUnit, setPkgUnit] = useState('')

  function calcUnitCost(priceStr: string, qtyStr: string, pUnit: string, bUnit: string): number | null {
    const price = parseFloat(priceStr)
    const qty = parseFloat(qtyStr)
    if (isNaN(price) || isNaN(qty) || price <= 0 || qty <= 0) return null

    const pu = (pUnit || '').toLowerCase().trim()
    const bu = (bUnit || '').toLowerCase().trim()

    let multiplier = 1
    if ((pu === 'l' || pu === 'liter' || pu === 'liters') && (bu === 'ml' || bu === 'milliliter' || bu === 'milliliters')) {
      multiplier = 1000
    } else if ((pu === 'kg' || pu === 'kilo' || pu === 'kilos') && (bu === 'g' || bu === 'gram' || bu === 'grams')) {
      multiplier = 1000
    } else if (pu === 'ml' && (bu === 'l' || bu === 'liter')) {
      multiplier = 0.001
    } else if (pu === 'g' && (bu === 'kg' || bu === 'kilo')) {
      multiplier = 0.001
    }

    return price / (qty * multiplier)
  }

  async function loadData() {
    setLoading(true)
    const result = await getFoodCostingData()
    if (result.success && result.data) {
      setData(result.data)
    } else {
      setError(result.error || 'Failed to load costing data')
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleUpdatePrice = async (productId: string) => {
    const newPrice = parseFloat(editingPriceValue)
    if (isNaN(newPrice) || newPrice < 0) return

    setIsUpdating(true)
    const result = await updateProductPrice(productId, newPrice)
    if (result.success) {
      await loadData()
    } else {
      alert(`Error updating price: ${result.error}`)
    }
    setEditingPriceId(null)
    setIsUpdating(false)
  }

  const handleUpdateIngredient = async (ingredientId: string) => {
    const newPurchasePrice = parseFloat(editIngredientCost)
    const newPurchaseYield = parseFloat(editIngredientYield)
    if (isNaN(newPurchasePrice) || newPurchasePrice < 0 || isNaN(newPurchaseYield) || newPurchaseYield <= 0 || !editIngredientName.trim()) return

    // Find the ingredient's purchase_yield to calculate new cost
    let targetIngredient = null
    for (const prod of data) {
      const found = prod.recipe_details.find(r => r.ingredient_id === ingredientId)
      if (found) {
        targetIngredient = found
        break
      }
    }

    if (!targetIngredient) return

    const yieldAmount = newPurchaseYield
    const newCost = newPurchasePrice / yieldAmount

    setIsUpdating(true)
    const result = await updateIngredient(ingredientId, { 
      name: editIngredientName.trim(), 
      purchase_price: newPurchasePrice,
      purchase_yield: newPurchaseYield
    })
    if (result.success) {
      const freshResult = await getFoodCostingData()
      if (freshResult.success && freshResult.data) {
        setData(freshResult.data)
        if (selectedProduct) {
          const freshProd = freshResult.data.find(p => p.product_id === selectedProduct.product_id)
          if (freshProd) setSelectedProduct(freshProd)
        }
      }
    } else {
      alert(`Error updating ingredient: ${result.error}`)
    }
    setEditingIngredientId(null)
    setIsUpdating(false)
  }

  const filteredData = useMemo(() => {
    return data.filter(item => 
      !searchQuery || 
      item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.store_name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [data, searchQuery])

  // Group by store
  const groupedData = useMemo(() => {
    const groups: Record<string, ProductCostData[]> = {}
    filteredData.forEach(item => {
      if (!groups[item.store_name]) groups[item.store_name] = []
      groups[item.store_name].push(item)
    })
    return groups
  }, [filteredData])

  function getCostPercentageColor(costPercentage: number) {
    if (costPercentage <= 35) return 'text-emerald-600 bg-emerald-50 border-emerald-200'
    if (costPercentage <= 50) return 'text-orange-600 bg-orange-50 border-orange-200'
    return 'text-red-600 bg-red-50 border-red-200'
  }

  if (error) {
    return (
      <div className="flex-1 min-h-0 p-8 flex items-center justify-center">
        <div className="text-red-600 bg-red-50 p-6 rounded-2xl flex items-center gap-4">
          <span className="material-symbols-outlined icon-xl">error</span>
          <p className="text-xl font-bold">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 min-w-0 p-4 sm:p-6 lg:p-8 bg-gray-50/50 overflow-y-auto">
      <div className="w-full max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-gray-900 text-4xl font-bold tracking-tight">Food Costing</h1>
          <p className="text-gray-500 mt-2 text-lg">Track food cost percentages and item profitability.</p>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            <p className="text-gray-500 mt-4 font-medium">Loading costing data...</p>
          </div>
        ) : (
          <>
            <div className="mb-8 relative max-w-xl">
              <span className="material-symbols-outlined icon-xl absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">search</span>
              <input 
                className="block w-full pl-14 pr-6 py-4 border border-gray-200 rounded-2xl bg-white focus:ring-2 focus:ring-black/5 outline-none transition-all text-lg shadow-sm" 
                placeholder="Search products or stores..." 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
              />
            </div>

            {Object.keys(groupedData).length === 0 ? (
               <div className="p-12 text-center text-gray-500 text-lg bg-white rounded-3xl border border-gray-200 shadow-sm">
                 No products found matching your search.
               </div>
            ) : (
              Object.entries(groupedData).map(([storeName, items]) => (
                <div key={storeName} className="mb-12">
                  <div className="mb-6">
                    <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                      <span className="material-symbols-outlined text-gray-400 text-3xl">storefront</span>
                      {storeName}
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {items.map((item) => {
                      const costPercentage = item.selling_price > 0 ? (item.total_ingredient_cost / item.selling_price) * 100 : 0;
                      
                      return (
                        <div key={item.product_id} className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col">
                          <div className="flex justify-between items-start mb-4 sm:mb-6 gap-3 sm:gap-4">
                            <h3 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight">{item.product_name}</h3>
                            <span className={`shrink-0 inline-flex items-center px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-black border ${getCostPercentageColor(costPercentage)}`}>
                              {costPercentage.toFixed(1)}% Cost
                            </span>
                          </div>
                          
                          <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6 flex-1">
                            <div className="grid grid-cols-2 gap-2 sm:gap-4">
                              <div className="flex flex-col">
                                <span className="text-gray-500 font-medium text-xs sm:text-sm">Selling Price</span>
                                {editingPriceId === item.product_id ? (
                                  <div className="flex items-center gap-1 mt-1">
                                    <span className="text-gray-500 font-bold">₱</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      className="w-16 px-1 py-1 border border-gray-300 rounded text-right focus:ring-2 focus:ring-gray-900 outline-none text-gray-900 font-bold text-sm"
                                      value={editingPriceValue}
                                      onChange={(e) => setEditingPriceValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleUpdatePrice(item.product_id)
                                        if (e.key === 'Escape') setEditingPriceId(null)
                                      }}
                                      disabled={isUpdating}
                                      autoFocus
                                    />
                                    <button onClick={() => handleUpdatePrice(item.product_id)} disabled={isUpdating} className="text-emerald-600 hover:bg-emerald-50 rounded p-1">
                                      <span className="material-symbols-outlined text-sm">check</span>
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 group cursor-pointer mt-1" onClick={() => { setEditingPriceId(item.product_id); setEditingPriceValue(item.selling_price.toString()) }}>
                                    <span className="text-gray-900 font-bold text-base sm:text-lg group-hover:text-black">₱{item.selling_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    <span className="material-symbols-outlined text-sm text-gray-300 group-hover:text-gray-600 transition-colors">edit</span>
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex flex-col items-end">
                                <span className="text-gray-500 font-medium text-xs sm:text-sm">Unit Cost</span>
                                <span className="text-gray-500 font-bold text-base sm:text-lg mt-1">₱{item.total_ingredient_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                              <span className="text-gray-900 font-bold uppercase tracking-wider text-xs sm:text-sm">Profit (Per Item)</span>
                              <span className={`font-black text-xl sm:text-2xl ${item.gross_profit < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                ₱{item.gross_profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>

                            <div className="pt-4 mt-2 border-t border-gray-100 grid grid-cols-2 gap-4">
                              <div className="flex flex-col">
                                <span className="text-gray-500 font-bold uppercase tracking-wider text-[10px]">Potential Batch Yield</span>
                                <span className="text-gray-900 font-black text-lg">{item.max_orders} items</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-gray-500 font-bold uppercase tracking-wider text-[10px]">Potential Batch Profit</span>
                                <span className={`font-black text-lg ${item.batch_profit < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                  ₱{item.batch_profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          </div>

                          <button 
                            onClick={() => setSelectedProduct(item)}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 transition-colors font-bold"
                          >
                            <span className="material-symbols-outlined text-[20px]">receipt_long</span>
                            View Recipe Breakdown
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* Breakdown Modal */}
        {selectedProduct && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="bg-white rounded-[2rem] shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="px-6 py-5 md:px-8 md:py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/80 flex-shrink-0">
                <div>
                  <h3 className="text-xl md:text-2xl font-bold text-gray-900">{selectedProduct.product_name}</h3>
                  <p className="text-xs md:text-sm font-medium text-gray-500 mt-1">Recipe Cost Breakdown</p>
                </div>
                <button 
                  onClick={() => setSelectedProduct(null)} 
                  className="p-2 bg-white text-gray-500 hover:text-gray-900 border border-gray-200 rounded-xl transition-all shadow-sm hover:shadow-md"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              
              <div className="p-6 md:p-8 overflow-y-auto flex-1 min-h-0">
                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 text-center">
                    <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Unit Cost</p>
                    <p className="text-lg md:text-2xl font-black text-gray-900">₱{selectedProduct.total_ingredient_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 text-center">
                    <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Sell Price</p>
                    <p className="text-lg md:text-2xl font-bold text-gray-600">₱{selectedProduct.selling_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 text-center">
                    <p className="text-[10px] md:text-xs font-bold text-emerald-600/70 uppercase tracking-widest mb-1">Unit Profit</p>
                    <p className={`text-lg md:text-2xl font-black ${selectedProduct.gross_profit < 0 ? 'text-red-500' : 'text-emerald-600'}`}>₱{selectedProduct.gross_profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>

                <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 mb-8 flex justify-between items-center">
                  <div>
                    <h4 className="text-blue-900 font-bold flex items-center gap-2">
                      <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                      Batch Potential
                    </h4>
                    <p className="text-sm text-blue-700/80 mt-1 max-w-sm">Calculated from the fresh batch size of your most limiting ingredient.</p>
                  </div>
                  <div className="text-right flex gap-6">
                    <div>
                      <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-0.5">Yield</p>
                      <p className="text-xl font-black text-blue-900">{selectedProduct.max_orders} items</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-0.5">Batch Profit</p>
                      <p className={`text-xl font-black ${selectedProduct.batch_profit < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        ₱{selectedProduct.batch_profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pr-2 scrollbar-thin">
                  {selectedProduct.recipe_details.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      <span className="material-symbols-outlined text-4xl mb-2">restaurant_menu</span>
                      <p className="text-lg font-medium">No recipe ingredients defined.</p>
                    </div>
                  ) : (
                    selectedProduct.recipe_details.map((ing) => (
                      <div key={ing.ingredient_id} className="p-4 border border-gray-100 rounded-2xl bg-white flex flex-col md:flex-row justify-between md:items-center shadow-sm gap-4">
                        {editingIngredientId === ing.ingredient_id ? (
                          <div className="flex-1 space-y-4">
                            <div>
                              <p className="text-xs font-bold text-gray-500 mb-1">Ingredient Name</p>
                              <input 
                                type="text" 
                                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none text-gray-900 font-bold"
                                value={editIngredientName}
                                onChange={e => setEditIngredientName(e.target.value)}
                                disabled={isUpdating}
                              />
                            </div>

                            <div className="flex gap-4">
                              <div className="flex-1">
                                <p className="text-xs font-bold text-gray-500 mb-1">Batch Price (₱)</p>
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-500 font-bold">₱</span>
                                  <input 
                                    type="number" 
                                    step="0.0001"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none text-gray-900 font-bold"
                                    value={editIngredientCost}
                                    onChange={e => setEditIngredientCost(e.target.value)}
                                    disabled={isUpdating}
                                  />
                                </div>
                              </div>
                              <div className="flex-1">
                                <p className="text-xs font-bold text-gray-500 mb-1">Amount ({ing.purchase_unit || 'Unit'})</p>
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="number" 
                                    step="0.0001"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none text-gray-900 font-bold"
                                    value={editIngredientYield}
                                    onChange={e => setEditIngredientYield(e.target.value)}
                                    disabled={isUpdating}
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="pt-2 flex justify-end gap-3 border-t border-slate-100 mt-4">
                              <div className="flex gap-2">
                                <button onClick={() => setEditingIngredientId(null)} disabled={isUpdating} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-xl font-bold text-sm transition-colors">Cancel</button>
                                <button onClick={() => handleUpdateIngredient(ing.ingredient_id)} disabled={isUpdating} className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl font-bold text-sm transition-colors">Save Changes</button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 group cursor-pointer" onClick={() => {
                                setEditingIngredientId(ing.ingredient_id)
                                setEditIngredientName(ing.ingredient_name)
                                setEditIngredientCost((ing.purchase_price || 0).toString())
                                setEditIngredientYield((ing.purchase_yield || 1).toString())
                                setPkgPrice('')
                                setPkgQty('')
                                setPkgUnit(ing.unit)
                              }}>
                                <p className="font-bold text-gray-900 text-lg group-hover:text-black">{ing.ingredient_name}</p>
                                <span className="material-symbols-outlined text-sm text-gray-300 group-hover:text-gray-600 transition-colors">edit</span>
                              </div>
                              <p className="text-sm text-gray-500 font-medium mt-1">
                                {ing.quantity_used} {ing.unit} <span className="mx-1 text-gray-300">•</span> ₱{ing.cost_per_unit.toLocaleString()} / {ing.unit}
                              </p>
                            </div>
                            <div className="text-right bg-gray-50 px-4 py-3 rounded-xl border border-gray-100 self-start md:self-auto shrink-0">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Item Cost</p>
                              <p className="text-lg font-black text-gray-900">₱{ing.total_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
