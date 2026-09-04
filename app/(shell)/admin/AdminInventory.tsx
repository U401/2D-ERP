'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

type Store = { id: string; name: string }

type ProductCapacity = {
  product_id: string
  product_name: string
  can_make: number
  limiting_ingredient: string
  price?: number
  potentialRevenue?: number
}

type IngredientDetail = {
  ingredient_id: string
  ingredient_name: string
  unit: string
  current_stock: number
  required_quantity: number
  can_make: number
}

type StoreData = {
  store: Store
  productCapacities: ProductCapacity[]
  totalProducts: number
  potentialRevenue: number
  loading: boolean
}

type SelectedProduct = {
  storeId: string
  product: ProductCapacity
  ingredients: IngredientDetail[]
  loadingIngredients: boolean
}

export default function AdminInventory() {
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  const [storeDataMap, setStoreDataMap] = useState<Record<string, StoreData>>({})
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function loadStores() {
      const { data, error } = await supabase.from('stores').select('id, name').order('name')
      if (error) { setError('Failed to load stores'); setInitialLoading(false); return }
      const storeList = data || []
      setStores(storeList)
      if (storeList.length > 0) {
        setSelectedStoreId(storeList[0].id)
        await loadStoreData(storeList[0].id, storeList)
      }
      setInitialLoading(false)
    }
    loadStores()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadStoreData(storeId: string, allStores: Store[], isBackground = false) {
    if (!isBackground) {
      setStoreDataMap(prev => ({
        ...prev,
        [storeId]: { store: allStores.find(s => s.id === storeId) || { id: storeId, name: '' }, productCapacities: [], totalProducts: 0, potentialRevenue: 0, loading: true },
      }))
    }

    try {
      const [ingredientsRes, recipesRes, productsRes] = await Promise.all([
        supabase.from('ingredients').select('id, name, unit, current_stock').eq('store_id', storeId),
        supabase.from('recipes').select('product_id, ingredient_id, quantity').eq('store_id', storeId),
        supabase.from('products').select('id, name, price').eq('store_id', storeId),
      ])

      const ingredients = ingredientsRes.data || []
      const recipes = recipesRes.data || []
      const products = productsRes.data || []

      const ingredientMap = new Map(ingredients.map(i => [i.id, i]))
      const recipesByProduct = new Map<string, typeof recipes>()
      recipes.forEach(r => {
        if (!recipesByProduct.has(r.product_id)) recipesByProduct.set(r.product_id, [])
        recipesByProduct.get(r.product_id)!.push(r)
      })

      const productCapacities: ProductCapacity[] = products.map(product => {
        const productRecipes = recipesByProduct.get(product.id) || []
        if (productRecipes.length === 0)
          return { product_id: product.id, product_name: product.name, can_make: 0, limiting_ingredient: 'No recipe', price: product.price, potentialRevenue: 0 }

        let minOrders = Infinity
        let limitingIngredient = ''
        productRecipes.forEach(recipe => {
          const ingredient = ingredientMap.get(recipe.ingredient_id)
          if (!ingredient) return
          if (ingredient.current_stock <= 0) { minOrders = 0; limitingIngredient = ingredient.name; return }
          const canMake = Math.floor(ingredient.current_stock / recipe.quantity)
          if (canMake < minOrders) { minOrders = canMake; limitingIngredient = ingredient.name }
        })

        const ordersCanMake = minOrders === Infinity ? 0 : minOrders
        return {
          product_id: product.id,
          product_name: product.name,
          can_make: ordersCanMake,
          limiting_ingredient: limitingIngredient,
          price: product.price,
          potentialRevenue: (product.price || 0) * ordersCanMake,
        }
      })

      const potentialRevenue = productCapacities.reduce((sum, pc) => sum + (pc.potentialRevenue || 0), 0)

      setStoreDataMap(prev => ({
        ...prev,
        [storeId]: { store: allStores.find(s => s.id === storeId) || { id: storeId, name: '' }, productCapacities, totalProducts: products.length, potentialRevenue, loading: false },
      }))
    } catch {
      setStoreDataMap(prev => ({ ...prev, [storeId]: { ...prev[storeId], loading: false } }))
      setError('Failed to load store inventory')
    }
  }

  async function handleProductTap(storeId: string, product: ProductCapacity) {
    setSelectedProduct({ storeId, product, ingredients: [], loadingIngredients: true })

    try {
      const { data: recipes } = await supabase
        .from('recipes').select('ingredient_id, quantity').eq('store_id', storeId).eq('product_id', product.product_id)

      if (!recipes || recipes.length === 0) {
        setSelectedProduct(prev => prev ? { ...prev, loadingIngredients: false } : null)
        return
      }

      const ingredientIds = recipes.map(r => r.ingredient_id)
      const { data: ingredients } = await supabase
        .from('ingredients').select('id, name, unit, current_stock').eq('store_id', storeId).in('id', ingredientIds)

      const ingredientDetails: IngredientDetail[] = recipes.map(recipe => {
        const ing = ingredients?.find(i => i.id === recipe.ingredient_id)
        if (!ing) return null
        return {
          ingredient_id: ing.id,
          ingredient_name: ing.name,
          unit: ing.unit,
          current_stock: ing.current_stock,
          required_quantity: recipe.quantity,
          can_make: ing.current_stock > 0 ? Math.floor(ing.current_stock / recipe.quantity) : 0,
        }
      }).filter((x): x is IngredientDetail => x !== null)

      setSelectedProduct(prev => prev ? { ...prev, ingredients: ingredientDetails, loadingIngredients: false } : null)
    } catch {
      setSelectedProduct(prev => prev ? { ...prev, loadingIngredients: false } : null)
    }
  }

  const refreshData = useCallback(() => {
    if (selectedStoreId && stores.length > 0) {
      loadStoreData(selectedStoreId, stores, true)
    }
  }, [selectedStoreId, stores])

  useAutoRefresh(refreshData, 10000)

  function handleSelectStore(storeId: string) {
    setSelectedStoreId(storeId)
    setSelectedProduct(null)
    if (!storeDataMap[storeId]) loadStoreData(storeId, stores)
  }

  const currentData = selectedStoreId ? storeDataMap[selectedStoreId] : null

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
  }

  if (stores.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="text-lg font-medium">No stores found</p>
        <p className="text-sm mt-1">Create stores first to view inventory</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Store Selector */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-2 pb-1">
          {stores.map(store => (
            <button
              key={store.id}
              type="button"
              onClick={() => handleSelectStore(store.id)}
              className={`flex-shrink-0 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                selectedStoreId === store.id
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
              }`}
            >
              {store.name}
            </button>
          ))}
        </div>
      </div>

      {/* Store Header */}
      {currentData && !currentData.loading && (
        <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Potential Revenue</p>
            <p className="text-xl font-black text-emerald-600">₱{currentData.potentialRevenue.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Products</p>
            <p className="text-xl font-black text-slate-900">{currentData.totalProducts}</p>
          </div>
        </div>
      )}

      {/* Product List */}
      {currentData?.loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : currentData ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {currentData.productCapacities.length === 0 ? (
            <p className="col-span-full text-center py-12 text-slate-400 text-sm italic">No products found for this store.</p>
          ) : (
            currentData.productCapacities
              .sort((a, b) => a.can_make - b.can_make)
              .map(pc => {
                const isZero = pc.can_make === 0
                const isLow = !isZero && pc.can_make <= 5
                return (
                  <button
                    key={pc.product_id}
                    type="button"
                    onClick={() => handleProductTap(selectedStoreId!, pc)}
                    className={`w-full flex flex-col justify-between rounded-2xl border p-4 text-left transition-all hover:-translate-y-1 hover:shadow-md active:scale-[0.98] ${
                      isZero
                        ? 'border-red-200 bg-red-50'
                        : isLow
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-slate-200 bg-white hover:border-slate-400'
                    }`}
                  >
                    <div className="w-full">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${isZero ? 'bg-red-100 text-red-600' : isLow ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {isZero ? 'Depleted' : isLow ? 'Low' : 'Available'}
                        </span>
                      </div>
                      <p className="text-lg font-bold text-slate-900 leading-tight mb-1">{pc.product_name}</p>
                      <p className={`text-xs font-medium line-clamp-2 ${isZero ? 'text-red-500' : 'text-slate-400'}`}>
                        {isZero
                          ? `Out: ${pc.limiting_ingredient}`
                          : `Limiter: ${pc.limiting_ingredient}`}
                      </p>
                    </div>
                    
                    <div className="mt-4 flex items-end justify-between w-full">
                      <div>
                        <p className={`text-3xl font-black leading-none ${isZero ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-slate-900'}`}>
                          {pc.can_make}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">orders</p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center">
                        <span className="material-symbols-outlined text-slate-400 text-base">arrow_forward</span>
                      </div>
                    </div>
                  </button>
                )
              })
          )}
        </div>
      ) : null}

      {/* Ingredient Detail — Bottom Sheet Modal */}
      {selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedProduct(null)}
        >
          <div
            className="bg-white rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-300"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>

            {/* Header */}
            <div className="px-5 pb-3 flex items-start justify-between border-b border-slate-100">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Recipe Analysis</p>
                <h3 className="text-xl font-black text-slate-900 mt-0.5">{selectedProduct.product.product_name}</h3>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Max Orders</p>
                <p className={`text-3xl font-black leading-none ${selectedProduct.product.can_make === 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  {selectedProduct.product.can_make}
                </p>
              </div>
            </div>

            {/* Ingredient List */}
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {selectedProduct.loadingIngredients ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : selectedProduct.ingredients.length === 0 ? (
                <p className="text-center py-10 text-slate-400 text-sm">No recipe defined for this product.</p>
              ) : (
                selectedProduct.ingredients.map(ing => {
                  const isOut = ing.current_stock === 0
                  const pct = Math.min(100, (ing.can_make / 50) * 100)
                  return (
                    <div
                      key={ing.ingredient_id}
                      className={`rounded-2xl border p-4 ${isOut ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50/50'}`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{ing.ingredient_name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Uses <span className="font-semibold text-slate-600">{ing.required_quantity}{ing.unit}</span> per order
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-2xl font-black leading-none ${isOut ? 'text-red-600' : 'text-slate-900'}`}>
                            {ing.current_stock}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">{ing.unit} stock</p>
                        </div>
                      </div>

                        <div className="space-y-1.5 mt-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Yield Capacity</span>
                            <span className={`text-xs font-black px-2 py-0.5 rounded-md ${isOut ? 'bg-red-100 text-red-600' : ing.can_make < 10 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                              {ing.can_make} orders left
                            </span>
                          </div>
                        </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Close Button */}
            <div className="p-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
