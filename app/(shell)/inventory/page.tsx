'use client'

import { useEffect, useState, useCallback , useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import AddIngredientModal from '@/components/modals/AddIngredientModal'
import EditIngredientModal from '@/components/modals/EditIngredientModal'
import RemoveStockModal from '@/components/modals/RemoveStockModal'
import { adjustIngredientStock } from '@/app/actions/inventory'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

type Store = {
  id: string
  name: string
  owner_user_id: string | null
}

type ProductOrderCapacity = {
  product_id: string
  product_name: string
  can_make: number
  limiting_ingredient: string
  price?: number
  potentialRevenue?: number
}

type Recipe = {
  id: string
  product_id: string
  ingredient_id: string
  quantity: number
}

type Ingredient = {
  id: string
  name: string
  unit: string
  current_stock: number
  low_stock_threshold: number
  category: string | null
  supplier_id: string | null
  purchase_price: number | null
  purchase_yield: number | null
  purchase_unit: string | null
}

type StoreInventory = {
  store: Store
  productCapacities: ProductOrderCapacity[]
  totalProducts: number
  totalOrdersPossible: number
  potentialRevenue: number
  ingredients?: Map<string, Ingredient>
}

type ProductIngredientDetail = {
  ingredient_id: string
  ingredient_name: string
  unit: string
  current_stock: number
  required_quantity: number
  can_make: number
}

export default function AdminInventoryPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [storeInventories, setStoreInventories] = useState<StoreInventory[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
  const [storeFilter, setStoreFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState<number>(1)
  const itemsPerPage = 20

  const [error, setError] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userStoreId, setUserStoreId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'inventory' | 'stock'>('inventory')
  const [allIngredients, setAllIngredients] = useState<(Ingredient & { store_name?: string })[]>([])
  const [updatingStock, setUpdatingStock] = useState<{ id: string, name: string, current: number, unit: string } | null>(null)
  const [newStockValue, setNewStockValue] = useState<string>('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [removingStock, setRemovingStock] = useState<{ id: string, name: string, current: number, unit: string } | null>(null)
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<{
    storeId: string
    product: ProductOrderCapacity
    ingredients: ProductIngredientDetail[]
  } | null>(null)
  const [viewStoreStockId, setViewStoreStockId] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('tab') === 'stock') {
        setActiveTab('stock')
      }
    }
  }, [])

  // Filter stores based on search query
  const filteredStores = storeInventories.filter(inv => {
    const storeName = inv.store.name || ''
    const matchesStore = !searchQuery || storeName.toLowerCase().includes(searchQuery.toLowerCase())
    
    if (userRole === 'admin') {
      const matchesProduct = inv.productCapacities.some(pc => 
        pc.product_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      return matchesStore || matchesProduct
    }
    
    return matchesStore
  })

  // For staff view, auto-select the first product if none selected
  useEffect(() => {
    if (userRole !== 'admin' && filteredStores.length > 0 && !selectedProduct && activeTab === 'inventory') {
      const firstStore = filteredStores[0];
      if (firstStore.productCapacities.length > 0) {
        handleProductClick(firstStore.store.id, firstStore.productCapacities[0]);
      }
    }
  }, [userRole, filteredStores.length, !!selectedProduct, activeTab]);

  const checkUserAndLoadData = useCallback(async () => {
    // Only show global loading spinner on initial load, background refetch should be silent
    if (filteredStores.length === 0) setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, store_id')
        .eq('id', user.id)
        .single()
      
      if (profileError) {
        console.error('Error fetching profile:', profileError)
        setError('Failed to load user profile')
      } else if (profile) {
        setUserRole(profile.role)
        setUserStoreId(profile.store_id)
        loadStoreInventories(profile.role, profile.store_id, user.id)
      }
    } else {
      setLoading(false)
    }
  }, [filteredStores.length, supabase])

  useEffect(() => {
    checkUserAndLoadData()
  }, [checkUserAndLoadData])

  // Track each order/restock changing in near real time
  useAutoRefresh(checkUserAndLoadData, 5000)

  async function loadStoreInventories(role?: string, storeId?: string | null, userId?: string) {
    if (filteredStores.length === 0) setLoading(true)
    setError(null)
    try {
      let storesQuery = supabase.from('stores').select('id, name, owner_user_id')
      if (role !== 'admin' && storeId) {
        storesQuery = storesQuery.eq('id', storeId)
      } else if (role === 'admin' && userId) {
        storesQuery = storesQuery.neq('owner_user_id', userId)
      }

      const { data: storesData, error: storesError } = await storesQuery.order('name')
      if (storesError) throw storesError
      if (!storesData || storesData.length === 0) {
        setLoading(false)
        return
      }

      setStores(storesData)
      const storeIds = storesData.map(s => s.id)

      const inventoryPromises = storesData.map(async (store) => {
        try {
          return await calculateStoreOrderCapacity(store.id, storesData)
        } catch (err) {
          return { store, productCapacities: [], totalProducts: 0, totalOrdersPossible: 0, potentialRevenue: 0 }
        }
      })

      const inventories = await Promise.all(inventoryPromises)
      setStoreInventories(inventories)

      let ingredientsQuery = supabase.from('ingredients').select('*, stores(name)')
      if (role === 'admin') {
        if (storeIds.length > 0) ingredientsQuery = ingredientsQuery.in('store_id', storeIds)
        else { setAllIngredients([]); setLoading(false); return; }
      } else if (storeId) {
        ingredientsQuery = ingredientsQuery.eq('store_id', storeId)
      }

      const { data: ingredientsData, error: ingredientsError } = await ingredientsQuery.order('name')
      if (ingredientsError) console.error('Error fetching ingredients:', ingredientsError)
      else if (ingredientsData) {
        setAllIngredients(ingredientsData.map(ing => ({ ...ing, store_name: (ing.stores as any)?.name })))
      }
      setLoading(false)
    } catch (err) {
      console.error('Error loading store inventories:', err)
      setError('Failed to load inventory data')
      setLoading(false)
    }
  }

  async function calculateStoreOrderCapacity(storeId: string, allStores: Store[]): Promise<StoreInventory> {
    try {
      const { data: ingredients } = await supabase.from('ingredients').select('id, name, unit, current_stock').eq('store_id', storeId)
      const ingredientMap = ingredients ? new Map(ingredients.map(i => [i.id, i])) : new Map()
      const { data: recipes } = await supabase.from('recipes').select('id, product_id, ingredient_id, quantity').eq('store_id', storeId)
      const { data: products } = await supabase.from('products').select('id, name, price').eq('store_id', storeId)

      if (!ingredients || !recipes || !products) {
        return { store: allStores.find(s => s.id === storeId) || { id: storeId, name: 'Unknown Store', owner_user_id: null }, productCapacities: [], totalProducts: 0, totalOrdersPossible: 0, potentialRevenue: 0 }
      }

      const recipesByProduct = new Map<string, Recipe[]>()
      recipes.forEach(recipe => {
        if (!recipesByProduct.has(recipe.product_id)) recipesByProduct.set(recipe.product_id, [])
        recipesByProduct.get(recipe.product_id)?.push(recipe)
      })

      const productCapacities: ProductOrderCapacity[] = products.map(product => {
        const productRecipes = recipesByProduct.get(product.id) || []
        if (productRecipes.length === 0) return { product_id: product.id, product_name: product.name, can_make: 0, limiting_ingredient: 'No recipe' }

        let minOrders = Infinity
        let limitingIngredient = ''

        productRecipes.forEach(recipe => {
          const ingredient = ingredientMap.get(recipe.ingredient_id)
          if (!ingredient) return
          if (ingredient.current_stock <= 0) { minOrders = 0; limitingIngredient = ingredient.name; return; }
          const canMake = Math.floor(ingredient.current_stock / recipe.quantity)
          if (canMake < minOrders) { minOrders = canMake; limitingIngredient = ingredient.name; }
        })

        const ordersCanMake = minOrders === Infinity ? 0 : minOrders
        return { product_id: product.id, product_name: product.name, can_make: ordersCanMake, limiting_ingredient: limitingIngredient, price: product.price, potentialRevenue: (product.price || 0) * ordersCanMake }
      })

      return {
        store: allStores.find(s => s.id === storeId) || { id: storeId, name: 'Unknown Store', owner_user_id: null },
        productCapacities,
        totalProducts: products.length,
        totalOrdersPossible: productCapacities.reduce((sum, pc) => sum + pc.can_make, 0),
        potentialRevenue: productCapacities.reduce((sum, pc) => sum + (pc.potentialRevenue || 0), 0),
        ingredients: ingredientMap
      }
    } catch (err) { throw err }
  }

  async function handleProductClick(storeId: string, product: ProductOrderCapacity) {
    try {
      const { data: recipes } = await supabase.from('recipes').select('ingredient_id, quantity').eq('store_id', storeId).eq('product_id', product.product_id)
      if (!recipes || recipes.length === 0) { setSelectedProduct({ storeId, product, ingredients: [] }); return; }

      const ingredientIds = recipes.map(r => r.ingredient_id)
      const { data: ingredients } = await supabase.from('ingredients').select('id, name, unit, current_stock, purchase_price, purchase_yield').eq('store_id', storeId).in('id', ingredientIds)

      const ingredientDetails: ProductIngredientDetail[] = recipes.map(recipe => {
        const ingredient = ingredients?.find(i => i.id === recipe.ingredient_id)
        if (!ingredient) return null
        return {
          ingredient_id: ingredient.id,
          ingredient_name: ingredient.name,
          unit: ingredient.unit,
          current_stock: ingredient.current_stock,
          required_quantity: recipe.quantity,
          can_make: ingredient.current_stock > 0 ? Math.floor(ingredient.current_stock / recipe.quantity) : 0
        }
      }).filter((item): item is ProductIngredientDetail => item !== null)

      setSelectedProduct({ storeId, product, ingredients: ingredientDetails })
    } catch (err) { setError('Failed to load product details') }
  }

  async function handleUpdateStock(e: React.FormEvent) {
    e.preventDefault()
    if (!updatingStock || newStockValue === '') return
    const value = parseFloat(newStockValue)
    if (isNaN(value)) return
    try {
      const result = await adjustIngredientStock(updatingStock.id, updatingStock.current + value)
      if (!result.success) throw new Error(result.error || 'Failed to update stock')
      setUpdatingStock(null); setNewStockValue(''); checkUserAndLoadData()
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed to update stock') }
  }

  function closeProductModal() {
    setSelectedProduct(null)
  }

  const isLowStock = (ingredient: Ingredient) => ingredient.low_stock_threshold != null && ingredient.current_stock > 0 && ingredient.current_stock <= ingredient.low_stock_threshold
  const outOfStockCount = allIngredients.filter(ing => ing.current_stock === 0).length
  const lowStockCount = allIngredients.filter(ing => isLowStock(ing)).length

  const uniqueCategories = useMemo(() => {
    const cats = new Set(allIngredients.map(ing => ing.category || 'Uncategorized'))
    return Array.from(cats).sort()
  }, [allIngredients])

  const uniqueStores = useMemo(() => {
    const s = new Set(allIngredients.map(ing => ing.store_name).filter(Boolean) as string[])
    return Array.from(s).sort()
  }, [allIngredients])

  const processedIngredients = useMemo(() => {
    let result = [...allIngredients]

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(ing => 
        ing.name.toLowerCase().includes(q) || 
        ing.store_name?.toLowerCase().includes(q) ||
        (ing.category && ing.category.toLowerCase().includes(q))
      )
    }

    if (storeFilter !== 'all') {
      result = result.filter(ing => ing.store_name === storeFilter)
    }

    if (categoryFilter !== 'all') {
      result = result.filter(ing => (ing.category || 'Uncategorized') === categoryFilter)
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'out') {
        result = result.filter(ing => ing.current_stock === 0)
      } else if (statusFilter === 'low') {
        result = result.filter(ing => isLowStock(ing))
      }
    }

    if (sortConfig) {
      result.sort((a, b) => {
        let aValue = a[sortConfig.key as keyof typeof a]
        let bValue = b[sortConfig.key as keyof typeof b]

        if (sortConfig.key === 'unit_cost') {
          aValue = (a.purchase_price || 0) / (a.purchase_yield || 1) as any
          bValue = (b.purchase_price || 0) / (b.purchase_yield || 1) as any
        } else if (sortConfig.key === 'category') {
          aValue = (a.category || 'Uncategorized') as any
          bValue = (b.category || 'Uncategorized') as any
        } else if (sortConfig.key === 'name') {
           aValue = a.name.toLowerCase() as any
           bValue = b.name.toLowerCase() as any
        } else if (sortConfig.key === 'store_name') {
           aValue = (a.store_name || '').toLowerCase() as any
           bValue = (b.store_name || '').toLowerCase() as any
        }

        const valA = aValue ?? ''
        const valB = bValue ?? ''
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [allIngredients, searchQuery, storeFilter, categoryFilter, statusFilter, sortConfig])

  const totalPages = Math.ceil(processedIngredients.length / itemsPerPage) || 1
  const paginatedIngredients = processedIngredients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, storeFilter, categoryFilter, statusFilter, sortConfig])

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig?.key !== columnKey) return <span className="material-symbols-outlined text-gray-300 text-sm align-middle ml-1">swap_vert</span>
    return <span className="material-symbols-outlined text-gray-900 text-sm align-middle ml-1">{sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
  }

  return (

    <div className="p-4 sm:p-6 lg:p-6 bg-gray-50/50">
      <div className="w-full max-w-7xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-gray-900 text-3xl font-bold tracking-tight">Inventory Management</h1>
            <p className="text-gray-500 mt-1 text-base mb-4">
              {userRole === 'admin' ? 'Monitor product availability across all stores' : 'Manage your store\'s stock levels and availability'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto mt-4 sm:mt-0">
            <button
              onClick={async () => {
                setRefreshing(true)
                await checkUserAndLoadData()
                setRefreshing(false)
              }}
              disabled={refreshing || loading}
              className="p-3 rounded-xl border border-gray-200 bg-white shadow-sm text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-all disabled:opacity-40"
              title="Refresh inventory"
            >
              <span className={`material-symbols-outlined icon-xl ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
            </button>
            <div className="flex bg-white p-2 rounded-2xl border border-gray-200 shadow-sm gap-1 w-full sm:w-auto overflow-x-auto">
              <button onClick={() => setActiveTab('inventory')} className={`px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-base sm:text-lg font-bold transition-all whitespace-nowrap flex-1 sm:flex-none ${activeTab === 'inventory' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}>Yield Capacity</button>
              <button onClick={() => setActiveTab('stock')} className={`px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-base sm:text-lg font-bold transition-all whitespace-nowrap flex-1 sm:flex-none ${activeTab === 'stock' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}>Store Stocks</button>
            </div>
          </div>
        </header>

        {error && <div className="mb-8 rounded-2xl border border-red-200 bg-red-50 p-6 flex items-center gap-4 text-red-900 text-lg font-medium"><span className="material-symbols-outlined icon-xl">error</span>{error}</div>}

        {activeTab === 'inventory' && !error && (
          <div className="mb-8 relative max-w-xl">
            <span className="material-symbols-outlined icon-xl absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">search</span>
            <input className="block w-full pl-14 pr-6 py-4 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-black/5 outline-none transition-all text-lg" placeholder={userRole === 'admin' ? "Search stores or products..." : "Search products..."} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
        )}
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div><p className="text-gray-500 mt-4 font-medium">Loading inventory...</p></div>
        ) : !error && activeTab === 'inventory' && filteredStores.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-dashed border-gray-300"><p className="text-gray-500">No data found matching your search.</p></div>
        ) : !error && activeTab === 'inventory' && (
          userRole === 'admin' ? (
            viewStoreStockId ? (
              <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 overflow-hidden flex flex-col animate-in fade-in duration-200">
                <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-3xl font-bold text-gray-900">{stores.find(s => s.id === viewStoreStockId)?.name} Stock</h3>
                    <p className="text-gray-500 mt-2 text-lg">Manage ingredient stock levels</p>
                  </div>
                  <button onClick={() => setViewStoreStockId(null)} className="p-3 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-xl transition-colors">
                    <span className="material-symbols-outlined icon-xl">close</span>
                  </button>
                </div>
                
                <div className="overflow-x-auto flex-1 p-6">
                  <table className="w-full text-left border-collapse">
                    <thead><tr className="bg-gray-50/50"><th className="px-4 py-3 md:px-6 md:py-4 text-xs font-bold text-gray-400 uppercase tracking-widest rounded-l-xl">Item</th><th className="px-4 py-3 md:px-6 md:py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Current Stock</th><th className="px-4 py-3 md:px-6 md:py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Unit Cost</th><th className="px-4 py-3 md:px-6 md:py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right rounded-r-xl">Actions</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {allIngredients.filter(ing => ing.store_name === stores.find(s => s.id === viewStoreStockId)?.name).map((ing) => (
                        <tr key={ing.id} className={`transition-colors ${ing.current_stock === 0 ? 'bg-red-50/30 hover:bg-red-50/50' : isLowStock(ing) ? 'bg-orange-50/30 hover:bg-orange-50/50' : 'hover:bg-gray-50/50'}`}>
                          <td className="px-4 py-3 md:px-6 md:py-4"><div><p className="font-semibold text-gray-900 text-base md:text-lg flex items-center flex-wrap gap-2">{ing.name}{ing.current_stock === 0 && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800">Out of Stock</span>}{isLowStock(ing) && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-orange-100 text-orange-800">Low Stock</span>}</p><p className="text-xs text-gray-400 mt-1">Unit: {ing.unit}</p></div></td>
                          <td className="px-4 py-3 md:px-6 md:py-4"><div className="flex items-end gap-1 md:gap-2"><span className={`text-xl md:text-3xl font-black tracking-tight ${ing.current_stock === 0 ? 'text-red-600' : isLowStock(ing) ? 'text-orange-500' : 'text-gray-900'}`}>{ing.current_stock.toLocaleString()}</span><span className="text-xs md:text-base text-gray-400 mb-0.5 md:mb-1">{ing.unit}</span></div></td>
                          <td className="px-4 py-3 md:px-6 md:py-4 text-right"><p className="text-base md:text-xl font-black text-gray-900">₱{((ing.purchase_price || 0) / (ing.purchase_yield || 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></td>
                          <td className="px-4 py-3 md:px-6 md:py-4 text-right">
                            <div className="flex justify-end gap-2 md:gap-3">
                              {userRole === 'admin' && <button onClick={() => setEditingIngredient(ing)} className="p-2 md:p-3 rounded-lg md:rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors" title="Edit"><span className="material-symbols-outlined text-base md:text-lg">edit</span></button>}
                              <button onClick={() => { setUpdatingStock({ id: ing.id, name: ing.name, current: ing.current_stock, unit: ing.unit }); setNewStockValue('') }} className="inline-flex items-center gap-1 md:gap-2 px-3 py-2 md:px-4 md:py-2.5 rounded-lg bg-gray-900 text-white text-sm md:text-base font-semibold hover:bg-gray-800 transition-colors shadow-sm" title="Update stock level"><span className="material-symbols-outlined text-base md:text-lg">inventory_2</span><span className="hidden sm:inline">Update Stock</span></button>
                              {userRole === 'admin' && <button onClick={() => setRemovingStock({ id: ing.id, name: ing.name, current: ing.current_stock, unit: ing.unit })} disabled={ing.current_stock === 0} className={`px-3 py-2 md:px-6 md:py-3 rounded-lg md:rounded-xl text-sm md:text-lg font-semibold transition-colors ${ing.current_stock === 0 ? 'text-gray-300 cursor-not-allowed' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}>Remove</button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {allIngredients.filter(ing => ing.store_name === stores.find(s => s.id === viewStoreStockId)?.name).length === 0 && (
                        <tr><td colSpan={4} className="px-8 py-12 text-center text-gray-500 text-lg">No ingredients found for this store.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {filteredStores.map((inventory) => (
                  <div key={inventory.store.id} className="bg-white rounded-[2rem] shadow-sm border border-gray-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                    <div className="bg-gradient-to-br from-gray-50 to-white px-5 py-5 sm:px-6 sm:py-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between gap-4 sm:gap-6">
                      <div>
                        <div className="flex items-center gap-2 sm:gap-3 mb-2"><span className="material-symbols-outlined text-gray-400 icon-xl">store</span><h2 className="text-lg sm:text-xl font-bold text-gray-900">{inventory.store.name}</h2></div>
                        <div className="inline-flex items-center px-3 py-1 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium bg-gray-100 text-gray-600">{inventory.totalProducts} Products</div>
                      </div>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-end w-full sm:w-auto mt-3 sm:mt-0">
                        <button 
                          onClick={() => setViewStoreStockId(inventory.store.id)} 
                          className="flex sm:flex-col items-center justify-center gap-2 sm:gap-0 p-3 bg-gray-900 text-white rounded-xl sm:rounded-2xl hover:bg-gray-800 transition-all shadow-md active:scale-95 w-full sm:w-auto shrink-0"
                          title="View Store Stock"
                        >
                          <span className="material-symbols-outlined text-xl mb-1">inventory_2</span>
                          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider font-bold">Stock</span>
                        </button>
                      </div>
                    </div>
                    <div className="p-3 sm:p-6 max-h-[500px] overflow-y-auto scrollbar-thin space-y-3 sm:space-y-4">
                      {inventory.productCapacities
                        .filter(pc => !searchQuery || pc.product_name.toLowerCase().includes(searchQuery.toLowerCase()) || inventory.store.name.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((pc) => (
                          <button 
                            key={pc.product_id} 
                            onClick={() => handleProductClick(inventory.store.id, pc)}
                            className="w-full flex items-center justify-between p-4 border border-gray-100 rounded-xl sm:rounded-2xl bg-white hover:bg-gray-50 transition-all text-left group"
                          >
                            <div className="flex-1 min-w-0 mr-3 sm:mr-6">
                              <p className="font-bold text-gray-900 text-base sm:text-xl truncate group-hover:text-black mb-1">{pc.product_name}</p>
                              <p className="text-[10px] sm:text-sm text-gray-400 font-medium uppercase tracking-wider font-bold truncate">
                                {pc.can_make === 0 ? `Out of stock: ${pc.limiting_ingredient}` : `Limiting: ${pc.limiting_ingredient}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 sm:gap-6 shrink-0">
                              <div className="text-right">
                                <p className={`text-xl sm:text-3xl font-black leading-none ${pc.can_make === 0 ? 'text-red-600' : 'text-gray-900'}`}>{pc.can_make}</p>
                                <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase mt-1 sm:mt-2">Orders</p>
                              </div>
                              <span className="material-symbols-outlined text-xl text-gray-300 group-hover:text-gray-900 transition-colors">chevron_right</span>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[700px]">
              <div className="lg:col-span-4 flex flex-col gap-6">
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col flex-1">
                  <div className="p-6 border-b border-gray-50 flex items-center justify-between"><h3 className="font-bold text-gray-900 text-xl tracking-tight">Menu Products</h3><span className="text-sm font-bold text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg">{filteredStores[0]?.productCapacities.length} items</span></div>
                  <div className="flex-1 overflow-y-auto p-6 scrollbar-thin max-h-[600px] space-y-3">
                    {filteredStores[0]?.productCapacities.filter(pc => !searchQuery || pc.product_name.toLowerCase().includes(searchQuery.toLowerCase())).map((pc) => (
                      <button key={pc.product_id} onClick={() => handleProductClick(filteredStores[0].store.id, pc)} className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${selectedProduct?.product.product_id === pc.product_id ? 'bg-gray-900 text-white shadow-xl shadow-gray-900/20' : 'bg-gray-100/60 hover:bg-gray-100 text-gray-900 border border-transparent'}`}>
                        <div className="text-left"><p className="font-bold text-lg truncate mb-1">{pc.product_name}</p><p className={`text-sm font-semibold uppercase tracking-wider font-bold ${selectedProduct?.product.product_id === pc.product_id ? 'text-gray-400' : 'text-gray-500'}`}>{pc.can_make} available</p></div>
                        <span className="material-symbols-outlined icon-xl">chevron_right</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="lg:col-span-8">
                {selectedProduct ? (
                  <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
                    <div className="p-6 md:p-8 border-b border-gray-50 bg-gradient-to-br from-white to-gray-50/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div><p className="text-sm font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Ingredient Analysis</p><h1 className="text-3xl font-black md:text-4xl text-gray-900 tracking-tight leading-none">{selectedProduct.product.product_name}</h1></div>
                      <div className="flex items-center gap-4 text-right"><div><p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Max Orders</p><p className={`text-3xl font-black md:text-4xl tracking-tighter leading-none ${selectedProduct.product.can_make === 0 ? 'text-red-600' : 'text-gray-900'}`}>{selectedProduct.product.can_make}</p></div></div>
                    </div>
                    <div className="p-6 md:p-8 flex-1 overflow-y-auto">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        {selectedProduct.ingredients.length === 0 ? (
                          <div className="col-span-full py-24 text-center text-gray-400">
                            <p className="text-2xl font-bold">No Recipe Found</p>
                          </div>
                        ) : (
                          selectedProduct.ingredients.map((ing) => (
                            <div key={ing.ingredient_id} className="p-5 rounded-3xl border border-gray-100 bg-white hover:border-gray-200 transition-all shadow-sm hover:shadow-md">
                              <div className="flex justify-between items-start gap-4 mb-6">
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-black text-gray-900 text-xl leading-tight mb-2">{ing.ingredient_name}</h4>
                                  <div className="flex flex-col gap-1">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-none">Usage</p>
                                    <p className="text-base font-medium text-gray-600">
                                      <span className="text-gray-900 font-bold">{ing.required_quantity}{ing.unit}</span> / order
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right shrink-0 bg-gray-50 p-3 rounded-2xl border border-gray-100/50">
                                  <p className={`text-2xl font-black tracking-tight leading-none mb-1 ${ing.current_stock === 0 ? 'text-red-600' : 'text-gray-900'}`}>{ing.current_stock}</p>
                                  <p className="text-xs font-bold text-gray-400 uppercase tracking-tight">{ing.unit} stock</p>
                                </div>
                              </div>
                              <div className="pt-4 mt-2 border-t border-gray-50 space-y-3">
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Yield Capacity</span>
                                    <span className={`text-sm font-black px-3 py-1 rounded-lg ${ing.can_make === 0 ? 'bg-red-100 text-red-600' : ing.can_make < 10 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
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
                ) : <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center h-full min-h-[600px] text-gray-300 p-12"><span className="material-symbols-outlined text-[80px] mb-6">touch_app</span><h3 className="text-3xl font-black text-gray-900">Select a Product</h3><p className="text-lg font-medium mt-2">Choose from the left to analyze yield.</p></div>}
              </div>
            </div>
          )
        )}

        {activeTab === 'stock' && !error && (
            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
              <div className="px-4 py-4 sm:px-8 sm:py-6 border-b border-gray-100 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
                  <div>
                    <div className="flex items-center gap-3 sm:gap-4">
                      <h2 className="font-bold text-gray-900 text-lg sm:text-xl">{userRole === 'admin' ? 'All Stores Stock' : 'Store Stock'}</h2>
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
                  <select className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/5 outline-none transition-all text-sm md:text-base bg-white" value={sortConfig ? `${sortConfig.key}-${sortConfig.direction}` : ''} onChange={e => {
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
                  </select>
              </div>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 mt-2">
                {paginatedIngredients.length === 0 ? (
                  <div className="col-span-full p-12 text-center text-gray-500 text-lg font-medium bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                    No items match your filters.
                  </div>
                ) : paginatedIngredients.map((ing) => (
                  <div key={ing.id} className={`flex flex-col p-5 rounded-2xl border transition-all hover:shadow-lg ${ing.current_stock === 0 ? 'bg-red-50/20 border-red-200 shadow-sm shadow-red-100' : isLowStock(ing) ? 'bg-orange-50/20 border-orange-200 shadow-sm shadow-orange-100' : 'bg-white border-gray-200 shadow-sm'}`}>
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
                           <span className={`text-3xl md:text-4xl font-black tracking-tighter leading-none ${ing.current_stock === 0 ? 'text-red-600' : isLowStock(ing) ? 'text-orange-500' : 'text-gray-900'}`}>{ing.current_stock.toLocaleString()}</span>
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
          )}
          
          {updatingStock && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 pb-24">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-4 animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-gray-900">Update Stock: {updatingStock.name}</h3><button onClick={() => setUpdatingStock(null)} className="text-gray-400 hover:text-gray-600"><span className="material-symbols-outlined text-lg">close</span></button></div>
              <form onSubmit={handleUpdateStock} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Amount to Add or Remove ({updatingStock.unit})</label>
                  <input autoFocus type="number" step="0.01" placeholder="e.g. 5 or -2" className="block w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-xl font-bold outline-none focus:ring-2 focus:ring-black/5" value={newStockValue} onChange={e => setNewStockValue(e.target.value)} />
                  <div className="mt-2 flex justify-between items-center text-xs font-medium">
                    <span className="text-gray-500">Current: {updatingStock.current} {updatingStock.unit}</span>
                    <span className="text-gray-900 font-bold">New: {(updatingStock.current + (parseFloat(newStockValue) || 0)).toLocaleString()} {updatingStock.unit}</span>
                  </div>
                </div>
                <div className="flex gap-2"><button type="button" onClick={() => setUpdatingStock(null)} className="flex-1 px-3 py-2.5 rounded-xl bg-gray-100 font-bold text-sm hover:bg-gray-200 text-gray-700">Cancel</button><button type="submit" disabled={!newStockValue || isNaN(parseFloat(newStockValue))} className="flex-1 px-3 py-2.5 rounded-xl bg-black text-white font-bold text-sm hover:bg-gray-800 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">Apply Update</button></div>
              </form>
            </div>
          </div>
        )}

        {removingStock && <RemoveStockModal ingredient={removingStock} onClose={() => setRemovingStock(null)} onSuccess={checkUserAndLoadData} />}
        {showAddModal && <AddIngredientModal onClose={() => { setShowAddModal(false); checkUserAndLoadData() }} />}
        {editingIngredient && <EditIngredientModal ingredient={editingIngredient} onClose={() => { setEditingIngredient(null); checkUserAndLoadData() }} />}
        
        {selectedProduct && userRole === 'admin' && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="px-8 py-6 border-b border-gray-100 bg-gray-50 flex justify-between items-start">
                <div><h3 className="text-2xl font-bold text-gray-900">{selectedProduct.product.product_name}</h3><p className="text-sm text-gray-500 mt-1">Recipe Analysis</p></div>
                <button onClick={closeProductModal} className="px-3 py-2 text-sm font-semibold text-gray-500 hover:text-gray-900 bg-white border border-gray-200 rounded-lg transition-colors">Close</button>
              </div>
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)] space-y-4">
                {selectedProduct.ingredients.length === 0 ? <p className="text-center py-12 text-gray-400">No recipe defined</p> : selectedProduct.ingredients.map((ing) => (
                  <div key={ing.ingredient_id} className="p-5 border border-gray-100 rounded-2xl bg-gray-50/50 flex justify-between items-center">
                    <div><p className="font-bold text-gray-900">{ing.ingredient_name}</p><p className="text-xs text-gray-400">Required: {ing.required_quantity} {ing.unit}</p></div>
                    <div className="text-right"><p className={`text-xl font-black ${ing.current_stock === 0 ? 'text-red-600' : 'text-gray-900'}`}>{ing.current_stock} {ing.unit}</p><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">In Stock</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
