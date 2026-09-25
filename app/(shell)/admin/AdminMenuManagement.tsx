'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import {
  getProductsForStore,
  getIngredientsForStore,
  addProductForStore,
  updateProductForStore,
  deleteProductForStore,
} from '@/app/actions/products'
import { getProductRecipes, syncProductRecipes } from '@/app/actions/recipes'
import { showConfirm } from '@/components/GlobalConfirm'

type Store = { id: string; name: string }

type Product = {
  id: string
  name: string
  price: number
  category: string | null
  image_url: string | null
  store_id: string
  low_stock_threshold: number
}

type Ingredient = { id: string; name: string; unit: string }

type RecipeItem = {
  ingredient_id: string
  ingredient_name?: string
  quantity: number
  unit?: string
}

type DrawerMode = 'add' | 'edit' | null

const EMPTY_FORM = { name: '', category: '', price: '', image_url: '', low_stock_threshold: '5' }

export default function AdminMenuManagement() {
  const supabase = createClient()

  const [stores, setStores] = useState<Store[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [products, setProducts] = useState<Product[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([])
  const [selectedIngredient, setSelectedIngredient] = useState('')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)

  const loadStores = useCallback(async () => {
    const { data } = await supabase.from('stores').select('id, name').order('name')
    if (data && data.length > 0) {
      setStores(data)
      // Only set initial store if none is selected
      setSelectedStoreId(prev => prev || data[0].id)
    }
  }, [supabase])

  // Load stores on mount
  useEffect(() => {
    loadStores()
  }, [loadStores])

  // Load products + ingredients when store changes
  const loadProducts = useCallback(async () => {
    if (!selectedStoreId) return
    const result = await getProductsForStore(selectedStoreId)
    if (result.success) {
      const prods = result.products as Product[]
      setProducts(prods)
      // Derive categories from products
      const cats = Array.from(new Set(prods.map(p => p.category).filter(Boolean) as string[])).sort()
      setCategories(cats)
    }
  }, [selectedStoreId])

  const loadIngredients = useCallback(async () => {
    if (!selectedStoreId) return
    const result = await getIngredientsForStore(selectedStoreId)
    if (result.success) setIngredients(result.ingredients as Ingredient[])
  }, [selectedStoreId])

  useEffect(() => {
    loadProducts()
    loadIngredients()
  }, [loadProducts, loadIngredients])

  const refreshData = useCallback(() => {
    loadStores()
    if (selectedStoreId) {
      loadProducts()
      loadIngredients()
    }
  }, [loadStores, loadProducts, loadIngredients, selectedStoreId])

  useAutoRefresh(refreshData, 10000)

  // ── Drawer helpers ─────────────────────────────────────────────────────────
  function openAdd() {
    setDrawerMode('add')
    setEditingProduct(null)
    setFormData(EMPTY_FORM)
    setRecipeItems([])
    setSelectedImage(null)
    setImagePreview(null)
    setNewCategoryInput('')
    setShowNewCategory(false)
  }

  async function openEdit(product: Product) {
    setDrawerMode('edit')
    setEditingProduct(product)
    setFormData({
      name: product.name,
      category: product.category || '',
      price: product.price.toString(),
      image_url: product.image_url || '',
      low_stock_threshold: (product.low_stock_threshold ?? 5).toString(),
    })
    setImagePreview(product.image_url || null)
    setSelectedImage(null)
    setNewCategoryInput('')
    setShowNewCategory(false)

    // Load recipe
    const result = await getProductRecipes(product.id, selectedStoreId)
    if (result.success && result.recipes) {
      setRecipeItems(
        result.recipes.map((r: any) => ({
          ingredient_id: r.ingredient_id,
          ingredient_name: r.ingredients?.name,
          quantity: r.quantity,
          unit: r.ingredients?.unit,
        }))
      )
    } else {
      setRecipeItems([])
    }
  }

  function closeDrawer() {
    setDrawerMode(null)
    setEditingProduct(null)
    setFormData(EMPTY_FORM)
    setRecipeItems([])
    setSelectedImage(null)
    setImagePreview(null)
  }

  // ── Image upload ───────────────────────────────────────────────────────────
  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return }
    if (file.size > 5 * 1024 * 1024) { alert('Image size must be less than 5MB'); return }
    setSelectedImage(file)
    const reader = new FileReader()
    reader.onloadend = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function uploadImage(): Promise<string | null> {
    if (!selectedImage) return editingProduct?.image_url || null
    const fileExt = selectedImage.name.split('.').pop()
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`
    const filePath = `products/${fileName}`
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, selectedImage, { contentType: selectedImage.type, upsert: false })
    if (uploadError) { alert(`Image upload failed: ${uploadError.message}`); return null }
    const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(filePath)
    return urlData.publicUrl
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedStoreId) return
    setIsProcessing(true)

    try {
      const imageUrl = await uploadImage()
      if (imageUrl === null && selectedImage) { setIsProcessing(false); return }

      const categoryValue = showNewCategory && newCategoryInput.trim()
        ? newCategoryInput.trim()
        : formData.category || null

      const productData = {
        name: formData.name,
        category: categoryValue,
        price: parseFloat(formData.price),
        image_url: imageUrl,
        low_stock_threshold: Math.max(1, parseInt(formData.low_stock_threshold, 10) || 5),
      }

      let productId: string
      if (drawerMode === 'edit' && editingProduct) {
        const result = await updateProductForStore(editingProduct.id, selectedStoreId, productData)
        if (!result.success) { alert(`Error: ${result.error}`); setIsProcessing(false); return }
        productId = editingProduct.id
      } else {
        const result = await addProductForStore(selectedStoreId, productData as any)
        if (!result.success) { alert(`Error: ${result.error}`); setIsProcessing(false); return }
        productId = result.product!.id
      }

      // Sync recipes
      const recipeRes = await syncProductRecipes(
        productId,
        recipeItems.map(r => ({
          ingredient_id: r.ingredient_id,
          quantity: r.quantity,
        })),
        selectedStoreId
      )

      if (!recipeRes.success) {
        alert(`Product saved but recipe error: ${recipeRes.error}`)
      }

      closeDrawer()
      await loadProducts()
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(product: Product) {
    if (!(await showConfirm(`Delete "${product.name}"? This cannot be undone.`))) return
    const result = await deleteProductForStore(product.id, selectedStoreId)
    if (result.success) {
      await loadProducts()
      if (editingProduct?.id === product.id) closeDrawer()
    } else {
      alert(`Error: ${result.error}`)
    }
  }

  // ── Recipe helpers ─────────────────────────────────────────────────────────
  function addIngredient() {
    if (!selectedIngredient) return
    const ing = ingredients.find(i => i.id === selectedIngredient)
    if (!ing) return
    if (recipeItems.some(r => r.ingredient_id === selectedIngredient)) {
      alert('Already in recipe'); return
    }
    setRecipeItems([...recipeItems, { ingredient_id: ing.id, ingredient_name: ing.name, quantity: 0, unit: ing.unit }])
    setSelectedIngredient('')
  }

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = products.filter(p =>
    !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedStoreName = stores.find(s => s.id === selectedStoreId)?.name || ''

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Menu Management</h2>
          <p className="text-sm text-slate-500 mt-0.5">Add and edit food items on the POS for each store.</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-semibold text-sm hover:bg-slate-800 transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add Food Item
        </button>
      </div>

      {/* Store Selector */}
      {stores.length > 1 && (
        <div className="flex items-center gap-3 mb-6 p-4 bg-white border border-slate-200 rounded-2xl">
          <span className="material-symbols-outlined text-slate-400">storefront</span>
          <span className="text-sm font-semibold text-slate-600 shrink-0">Store:</span>
          <div className="flex gap-2 flex-wrap">
            {stores.map(store => (
              <button
                key={store.id}
                onClick={() => setSelectedStoreId(store.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  selectedStoreId === store.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {store.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
        <input
          className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          placeholder="Search food items..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Products Grid */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center bg-white border border-dashed border-slate-200 rounded-2xl">
          <span className="material-symbols-outlined text-4xl text-slate-300 mb-3">restaurant_menu</span>
          <p className="text-slate-400 font-medium">
            {searchQuery ? 'No items match your search.' : `No items yet for ${selectedStoreName}. Add one!`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(product => (
            <div
              key={product.id}
              className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition-shadow flex flex-col"
            >
              {/* Image */}
              <div className="h-36 bg-gradient-to-br from-amber-50 to-orange-100 flex-shrink-0 relative overflow-hidden">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-5xl text-orange-200">restaurant</span>
                  </div>
                )}
                {product.category && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[10px] font-bold rounded-full uppercase tracking-widest backdrop-blur-sm">
                    {product.category}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-4 flex-1 flex flex-col">
                <p className="font-bold text-slate-900 text-base leading-tight">{product.name}</p>
                <p className="text-xl font-black text-slate-900 mt-2">₱{product.price.toFixed(2)}</p>

                <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => openEdit(product)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-semibold transition-colors border border-slate-200"
                  >
                    <span className="material-symbols-outlined text-[16px]">edit</span>
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(product)}
                    className="flex items-center justify-center p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-slate-200"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Drawer Overlay ─────────────────────────────────────────────────── */}
      {drawerMode && (
        <div className="fixed inset-0 z-[110] flex">
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/50 backdrop-blur-sm"
            onClick={closeDrawer}
          />

          {/* Drawer panel */}
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-hidden">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {drawerMode === 'add' ? 'Add Food Item' : 'Edit Food Item'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedStoreName}</p>
              </div>
              <button onClick={closeDrawer} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto p-6">
              <form id="menu-item-form" onSubmit={handleSubmit} className="space-y-5">
                {/* Name */}
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Product Name</label>
                  <input
                    required
                    type="text"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white"
                    placeholder="e.g. Iced Americano"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Category</label>
                  {!showNewCategory ? (
                    <div className="flex gap-2">
                      <select
                        className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white"
                        value={formData.category}
                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                      >
                        <option value="">No category</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowNewCategory(true)}
                        className="px-3 py-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 text-sm font-semibold transition-colors"
                      >
                        + New
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                        placeholder="New category name..."
                        value={newCategoryInput}
                        onChange={e => setNewCategoryInput(e.target.value)}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => { setShowNewCategory(false); setNewCategoryInput('') }}
                        className="px-3 py-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Price */}
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Selling Price</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">₱</span>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full pl-8 pr-4 py-3 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white"
                      placeholder="0.00"
                      value={formData.price}
                      onChange={e => setFormData({ ...formData, price: e.target.value })}
                    />
                  </div>
                </div>

                {/* Low Stock Alert Threshold */}
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block flex items-center justify-between">
                    <span>Low Stock Alert Threshold</span>
                    <span className="text-[10px] text-amber-600 font-semibold normal-case flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">notifications_active</span>
                      Servings remaining
                    </span>
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white"
                    placeholder="e.g. 5"
                    value={formData.low_stock_threshold}
                    onChange={e => setFormData({ ...formData, low_stock_threshold: e.target.value })}
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
                    Notify admin when remaining ingredient stock drops below this many servings.
                  </p>
                </div>

                {/* Image */}
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Product Image</label>
                  <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-colors relative overflow-hidden">
                    {imagePreview ? (
                      <>
                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-xl" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                          <span className="text-white text-sm font-semibold">Click to change</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <span className="material-symbols-outlined text-3xl">add_photo_alternate</span>
                        <span className="text-xs font-medium">Click to upload (max 5MB)</span>
                      </div>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  </label>
                  {imagePreview && (
                    <button
                      type="button"
                      onClick={() => { setSelectedImage(null); setImagePreview(null) }}
                      className="mt-2 text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Remove image
                    </button>
                  )}
                </div>

                {/* Recipe Ingredients */}
                <div className="border-t border-slate-100 pt-5">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Recipe Ingredients</h4>

                  {recipeItems.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {recipeItems.map((item, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <p className="flex-1 text-sm font-semibold text-slate-900 truncate">{item.ingredient_name}</p>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-900 text-center focus:outline-none focus:ring-1 focus:ring-slate-900/20 bg-white"
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={e => {
                              const updated = [...recipeItems]
                              updated[i].quantity = parseFloat(e.target.value) || 0
                              setRecipeItems(updated)
                            }}
                          />
                          <span className="text-xs text-slate-400 w-8 shrink-0">{item.unit}</span>
                          <button
                            type="button"
                            onClick={() => setRecipeItems(recipeItems.filter((_, idx) => idx !== i))}
                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <select
                      className="flex-1 px-3 py-2.5 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-1 focus:ring-slate-900/20 bg-white"
                      value={selectedIngredient}
                      onChange={e => setSelectedIngredient(e.target.value)}
                    >
                      <option value="">Select ingredient...</option>
                      {ingredients
                        .filter(i => !recipeItems.some(r => r.ingredient_id === i.id))
                        .map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)
                      }
                    </select>
                    <button
                      type="button"
                      onClick={addIngredient}
                      disabled={!selectedIngredient}
                      className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Drawer footer */}
            <div className="px-6 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-slate-100 shrink-0 flex gap-3 bg-white">
              <button
                type="button"
                onClick={closeDrawer}
                className="flex-1 py-3 border border-slate-200 rounded-xl text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                form="menu-item-form"
                type="submit"
                disabled={isProcessing}
                className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-semibold text-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing ? 'Saving...' : drawerMode === 'add' ? 'Add Item' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
