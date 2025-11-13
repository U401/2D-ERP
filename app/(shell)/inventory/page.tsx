'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { restockIngredient, deleteIngredient } from '@/app/actions/inventory'
import { addSupplier, getSuppliers } from '@/app/actions/suppliers'
import AddIngredientModal from '@/components/modals/AddIngredientModal'
import RestockModal from '@/components/modals/RestockModal'
import EditIngredientModal from '@/components/modals/EditIngredientModal'
import AddSupplierModal from '@/components/modals/AddSupplierModal'
import EditSupplierModal from '@/components/modals/EditSupplierModal'
import EditRecipeModal from '@/components/modals/EditRecipeModal'
import { format } from 'date-fns'

type Ingredient = {
  id: string
  name: string
  unit: string
  category: string | null
  supplier_id: string | null
  current_stock: number
  cost: number
  low_stock_threshold: number
  updated_at: string
  suppliers?: { name: string } | null
}

type Supplier = {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
}

type Recipe = {
  id: string
  product_id: string
  ingredient_id: string
  quantity: number
  products?: { id: string; name: string } | null
  ingredients?: { id: string; name: string; unit: string } | null
}

type RecipeGroup = {
  product_id: string
  product_name: string
  ingredient_count: number
  last_updated: string | null
  recipes: Recipe[]
}

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<'ingredients' | 'suppliers' | 'recipes'>('ingredients')
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showRestockModal, setShowRestockModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false)
  const [showEditSupplierModal, setShowEditSupplierModal] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showLowStock, setShowLowStock] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [recipeGroups, setRecipeGroups] = useState<RecipeGroup[]>([])
  const [selectedRecipeGroup, setSelectedRecipeGroup] = useState<RecipeGroup | null>(null)
  const [showRecipeModal, setShowRecipeModal] = useState(false)
  const [showEditRecipeModal, setShowEditRecipeModal] = useState(false)
  const [recipeSearchQuery, setRecipeSearchQuery] = useState('')

  useEffect(() => {
    if (activeTab === 'ingredients') {
      loadIngredients()
    } else if (activeTab === 'suppliers') {
      loadSuppliers()
    } else if (activeTab === 'recipes') {
      loadRecipes()
    }
  }, [activeTab])

  async function loadIngredients() {
    const supabase = createClient()
    const { data } = await supabase
      .from('ingredients')
      .select('*, suppliers(name)')
      .order('name')
    
    if (data) {
      setIngredients(data as Ingredient[])
    }
  }

  async function loadSuppliers() {
    const result = await getSuppliers()
    if (result.success) {
      setSuppliers(result.suppliers as Supplier[])
    }
  }

  async function loadRecipes() {
    const supabase = createClient()
    const { data } = await supabase
      .from('recipes')
      .select('*, products(id, name), ingredients(id, name, unit)')
      .order('product_id')
    
    if (data) {
      setRecipes(data as Recipe[])
      
      // Group recipes by product
      const grouped = new Map<string, RecipeGroup>()
      
      data.forEach((recipe: Recipe) => {
        const productId = recipe.product_id
        const productName = recipe.products?.name || 'Unknown Product'
        
        if (!grouped.has(productId)) {
          grouped.set(productId, {
            product_id: productId,
            product_name: productName,
            ingredient_count: 0,
            last_updated: null,
            recipes: []
          })
        }
        
        const group = grouped.get(productId)!
        group.recipes.push(recipe)
        group.ingredient_count = group.recipes.length
      })
      
      setRecipeGroups(Array.from(grouped.values()))
    }
  }

  async function handleDeleteIngredient(ingredientId: string, ingredientName: string) {
    if (!confirm(`Are you sure you want to delete "${ingredientName}"? This action cannot be undone.`)) {
      return
    }

    const result = await deleteIngredient(ingredientId)
    if (result.success) {
      await loadIngredients()
    } else {
      alert(`Error: ${result.error}`)
    }
  }

  function getStockStatus(ingredient: Ingredient): 'in-stock' | 'low-stock' | 'out-of-stock' {
    if (ingredient.current_stock === 0) return 'out-of-stock'
    if (ingredient.current_stock <= ingredient.low_stock_threshold) return 'low-stock'
    return 'in-stock'
  }

  const categories = Array.from(new Set(ingredients.map((i) => i.category).filter(Boolean)))
  
  const filteredIngredients = ingredients.filter((ing) => {
    const matchesSearch = !searchQuery || ing.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = !selectedCategory || ing.category === selectedCategory
    const matchesLowStock = !showLowStock || getStockStatus(ing) !== 'in-stock'
    return matchesSearch && matchesCategory && matchesLowStock
  })

  return (
    <div className="flex-1 p-8">
      <div className="w-full max-w-7xl mx-auto">
        <header className="flex flex-wrap justify-between items-center gap-4 mb-8">
          <h1 className="text-gray-900 text-3xl font-bold leading-tight">
            Inventory Management
          </h1>
          <div className="flex items-center gap-4">
            {activeTab === 'ingredients' && (
              <>
                <button
                  onClick={() => setShowAddSupplierModal(true)}
                  className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-button-gray text-gray-900 text-sm font-medium leading-normal tracking-wide border border-gray-200 hover:bg-[#D0D0D0] transition-colors"
                >
                  <span className="truncate">+ Add New Supplier</span>
                </button>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-button-gray text-gray-900 text-sm font-medium leading-normal tracking-wide hover:bg-[#D0D0D0] transition-colors border border-gray-200"
                >
                  <span className="truncate">+ Add New Ingredient</span>
                </button>
              </>
            )}
            {activeTab === 'recipes' && (
              <button
                onClick={() => {
                  window.location.href = '/menu'
                }}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-button-gray text-gray-900 text-sm font-medium leading-normal tracking-wide border border-gray-200 hover:bg-[#D0D0D0] transition-colors"
              >
                <span className="truncate">+ Add New Recipe</span>
              </button>
            )}
          </div>
        </header>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav aria-label="Tabs" className="-mb-px flex gap-6">
            <button
              onClick={() => setActiveTab('ingredients')}
              className={`shrink-0 border-b-2 px-1 pb-4 text-sm font-medium transition-colors ${
                activeTab === 'ingredients'
                  ? 'border-primary text-gray-900'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              Ingredients
            </button>
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`shrink-0 border-b-2 px-1 pb-4 text-sm font-medium transition-colors ${
                activeTab === 'suppliers'
                  ? 'border-primary text-gray-900'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              Suppliers
            </button>
            <button
              onClick={() => setActiveTab('recipes')}
              className={`shrink-0 border-b-2 px-1 pb-4 text-sm font-medium transition-colors ${
                activeTab === 'recipes'
                  ? 'border-primary text-gray-900'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              Recipes
            </button>
          </nav>
        </div>

        {activeTab === 'ingredients' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 py-6">
            <div className="lg:col-span-2">
              <label className="flex flex-col min-w-40 h-10 w-full">
                <div className="flex w-full flex-1 items-stretch rounded-lg h-full bg-input-gray border border-gray-300 focus-within:border-black">
                  <div className="text-gray-500 flex items-center justify-center pl-3">
                    <span className="material-symbols-outlined !text-xl">search</span>
                  </div>
                  <input
                    className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden text-gray-900 focus:outline-0 focus:ring-0 border-none bg-transparent h-full placeholder:text-gray-500 px-2 text-sm font-normal leading-normal"
                    placeholder="Search by ingredient name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </label>
            </div>
            <div className="flex items-center">
              <select
                className="flex h-10 w-full items-center justify-between gap-x-2 rounded-lg bg-input-gray border border-gray-300 px-4 text-sm font-medium leading-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-start lg:justify-end gap-3 h-10 px-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer" htmlFor="low-stock-toggle">
                Show Low Stock
              </label>
              <button
                id="low-stock-toggle"
                onClick={() => setShowLowStock(!showLowStock)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:ring-offset-2 dark:focus:ring-offset-background-dark ${
                  showLowStock ? 'bg-black dark:bg-white' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-black shadow ring-0 transition duration-200 ease-in-out ${
                    showLowStock ? 'translate-x-5' : 'translate-x-0'
                  }`}
                ></span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'ingredients' && (
          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
            <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <th className="px-6 py-4 font-medium" scope="col">Name</th>
                  <th className="px-6 py-4 font-medium" scope="col">Category</th>
                  <th className="px-6 py-4 font-medium" scope="col">Stock Level</th>
                  <th className="px-6 py-4 font-medium" scope="col">Unit</th>
                  <th className="px-6 py-4 font-medium" scope="col">Supplier</th>
                  <th className="px-6 py-4 font-medium" scope="col">Last Updated</th>
                  <th className="px-6 py-4 font-medium" scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredIngredients.map((ingredient) => {
                  const status = getStockStatus(ingredient)
                  return (
                    <tr
                      key={ingredient.id}
                      className="border-b border-gray-200"
                    >
                      <th
                        className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap"
                        scope="row"
                      >
                        {ingredient.name}
                      </th>
                      <td className="px-6 py-4">{ingredient.category || '-'}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            status === 'in-stock'
                              ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              : status === 'low-stock'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                          }`}
                        >
                          {status === 'in-stock'
                            ? 'In Stock'
                            : status === 'low-stock'
                            ? 'Low Stock'
                            : 'Out of Stock'}
                        </span>
                      </td>
                      <td className="px-6 py-4">{ingredient.unit}</td>
                      <td className="px-6 py-4">
                        {ingredient.suppliers?.name || '-'}
                      </td>
                      <td className="px-6 py-4">
                        {ingredient.updated_at
                          ? format(new Date(ingredient.updated_at), 'MMM d, yyyy')
                          : '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setSelectedIngredient(ingredient)
                              setShowEditModal(true)
                            }}
                            className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                            title="Edit ingredient"
                          >
                            <span
                              className="material-symbols-outlined !text-xl"
                              style={{
                                fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20",
                              }}
                            >
                              edit
                            </span>
                            <span className="sr-only">Edit</span>
                          </button>
                          <button
                            onClick={() => {
                              setSelectedIngredient(ingredient)
                              setShowRestockModal(true)
                            }}
                            className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                            title="Restock ingredient"
                          >
                            <span className="material-symbols-outlined !text-xl">add</span>
                            <span className="sr-only">Restock</span>
                          </button>
                          <button
                            onClick={() => handleDeleteIngredient(ingredient.id, ingredient.name)}
                            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                            title="Delete ingredient"
                          >
                            <span className="material-symbols-outlined !text-xl">delete</span>
                            <span className="sr-only">Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'suppliers' && (
          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
            <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
              <thead className="text-xs text-gray-700 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-6 py-4 font-medium" scope="col">Name</th>
                  <th className="px-6 py-4 font-medium" scope="col">Contact Person</th>
                  <th className="px-6 py-4 font-medium" scope="col">Phone</th>
                  <th className="px-6 py-4 font-medium" scope="col">Email</th>
                  <th className="px-6 py-4 font-medium" scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer"
                  >
                    <th
                      className="px-6 py-4 font-medium text-gray-900 dark:text-white whitespace-nowrap"
                      scope="row"
                    >
                      {supplier.name}
                    </th>
                    <td className="px-6 py-4">{supplier.contact_person || '-'}</td>
                    <td className="px-6 py-4">{supplier.phone || '-'}</td>
                    <td className="px-6 py-4">{supplier.email || '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedSupplier(supplier)
                          setShowEditSupplierModal(true)
                        }}
                        className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                      >
                        <span
                          className="material-symbols-outlined !text-xl"
                          style={{
                            fontVariationSettings:
                              "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20",
                          }}
                        >
                          edit
                        </span>
                        <span className="sr-only">Edit</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'recipes' && (
          <>
            <div className="mb-6">
              <label className="flex flex-col min-w-40 h-10 w-full max-w-sm">
                <div className="flex w-full flex-1 items-stretch rounded-lg h-full bg-input-gray border border-gray-300 focus-within:border-black">
                  <div className="text-gray-500 flex items-center justify-center pl-3">
                    <span className="material-symbols-outlined !text-xl">search</span>
                  </div>
                  <input
                    className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden text-gray-900 focus:outline-0 focus:ring-0 border-none bg-transparent h-full placeholder:text-gray-500 px-2 text-sm font-normal leading-normal"
                    placeholder="Search by recipe or product name..."
                    value={recipeSearchQuery}
                    onChange={(e) => setRecipeSearchQuery(e.target.value)}
                  />
                </div>
              </label>
            </div>
            <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
              <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead className="text-xs text-gray-700 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-6 py-4 font-medium" scope="col">Recipe Name</th>
                    <th className="px-6 py-4 font-medium" scope="col">Product</th>
                    <th className="px-6 py-4 font-medium" scope="col">Number of Ingredients</th>
                    <th className="px-6 py-4 font-medium" scope="col">Last Updated</th>
                    <th className="px-6 py-4 font-medium" scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recipeGroups
                    .filter((group) => {
                      if (!recipeSearchQuery) return true
                      const query = recipeSearchQuery.toLowerCase()
                      return (
                        group.product_name.toLowerCase().includes(query) ||
                        group.recipes.some((r) =>
                          r.ingredients?.name.toLowerCase().includes(query)
                        )
                      )
                    })
                    .map((group) => (
                      <tr
                        key={group.product_id}
                        onClick={() => {
                          setSelectedRecipeGroup(group)
                          setShowRecipeModal(true)
                        }}
                        className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer"
                      >
                        <th
                          className="px-6 py-4 font-medium text-gray-900 dark:text-white whitespace-nowrap"
                          scope="row"
                        >
                          {group.product_name}
                        </th>
                        <td className="px-6 py-4">{group.product_name}</td>
                        <td className="px-6 py-4">{group.ingredient_count}</td>
                        <td className="px-6 py-4">
                          {group.last_updated
                            ? format(new Date(group.last_updated), 'yyyy-MM-dd')
                            : '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedRecipeGroup(group)
                              setShowEditRecipeModal(true)
                            }}
                            className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                          >
                            <span
                              className="material-symbols-outlined !text-xl"
                              style={{
                                fontVariationSettings:
                                  "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20",
                              }}
                            >
                              edit
                            </span>
                            <span className="sr-only">Edit</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              // Delete functionality - placeholder
                              if (
                                confirm(
                                  `Are you sure you want to delete all recipes for ${group.product_name}?`
                                )
                              ) {
                                // TODO: Implement delete
                                alert('Delete functionality coming soon')
                              }
                            }}
                            className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors ml-2"
                          >
                            <span
                              className="material-symbols-outlined !text-xl"
                              style={{
                                fontVariationSettings:
                                  "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20",
                              }}
                            >
                              delete
                            </span>
                            <span className="sr-only">Delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showAddModal && (
        <AddIngredientModal
          onClose={() => {
            setShowAddModal(false)
            loadIngredients()
          }}
        />
      )}

      {showRestockModal && selectedIngredient && (
        <RestockModal
          ingredient={selectedIngredient}
          onClose={() => {
            setShowRestockModal(false)
            setSelectedIngredient(null)
            loadIngredients()
          }}
        />
      )}

      {showEditModal && selectedIngredient && (
        <EditIngredientModal
          ingredient={selectedIngredient}
          onClose={() => {
            setShowEditModal(false)
            setSelectedIngredient(null)
            loadIngredients()
          }}
        />
      )}

      {showAddSupplierModal && (
        <AddSupplierModal
          onClose={() => {
            setShowAddSupplierModal(false)
            loadSuppliers()
          }}
        />
      )}

      {showEditSupplierModal && selectedSupplier && (
        <EditSupplierModal
          supplier={selectedSupplier}
          onClose={() => {
            setShowEditSupplierModal(false)
            setSelectedSupplier(null)
          }}
          onSuccess={() => {
            loadSuppliers()
          }}
        />
      )}

      {showEditRecipeModal && selectedRecipeGroup && (
        <EditRecipeModal
          productId={selectedRecipeGroup.product_id}
          productName={selectedRecipeGroup.product_name}
          onClose={() => {
            setShowEditRecipeModal(false)
            setSelectedRecipeGroup(null)
          }}
          onSuccess={() => {
            loadRecipes()
          }}
        />
      )}

      {showRecipeModal && selectedRecipeGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md p-6 bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Recipe Details</h2>
              <button
                onClick={() => {
                  setShowRecipeModal(false)
                  setSelectedRecipeGroup(null)
                }}
                className="text-gray-500 hover:text-black transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="border-b border-gray-200 pb-4 mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {selectedRecipeGroup.product_name}
              </h3>
              <p className="text-sm text-gray-500">
                Product: {selectedRecipeGroup.product_name}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              <h4 className="text-md font-semibold text-gray-800 mb-2">Ingredients</h4>
              <ul className="space-y-2">
                {selectedRecipeGroup.recipes.map((recipe) => (
                  <li
                    key={recipe.id}
                    className="flex justify-between items-center p-3 bg-gray-100 rounded-lg"
                  >
                    <span className="font-medium text-gray-800">
                      {recipe.ingredients?.name || 'Unknown Ingredient'}
                    </span>
                    <span className="text-gray-600">
                      {recipe.quantity} {recipe.ingredients?.unit || ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRecipeModal(false)
                  setSelectedRecipeGroup(null)
                }}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-button-gray text-gray-900 text-sm font-medium leading-normal tracking-wide hover:bg-[#D0D0D0] transition-colors border border-gray-200"
                type="button"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowRecipeModal(false)
                  setShowEditRecipeModal(true)
                }}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-button-gray text-gray-900 text-sm font-medium leading-normal tracking-wide hover:bg-[#D0D0D0] transition-colors border border-gray-200"
                type="button"
              >
                <span className="material-symbols-outlined !text-xl mr-2">edit</span>
                Edit Recipe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

