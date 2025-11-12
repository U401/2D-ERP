'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { restockIngredient } from '@/app/actions/inventory'
import AddIngredientModal from '@/components/modals/AddIngredientModal'
import RestockModal from '@/components/modals/RestockModal'

type Ingredient = {
  id: string
  name: string
  unit: string
  current_stock: number
  cost: number
  low_stock_threshold: number
}

export default function InventoryPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showRestockModal, setShowRestockModal] = useState(false)
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showLowStock, setShowLowStock] = useState(false)

  useEffect(() => {
    loadIngredients()
  }, [])

  async function loadIngredients() {
    const supabase = createClient()
    const { data } = await supabase
      .from('ingredients')
      .select('*')
      .order('name')
    
    if (data) {
      setIngredients(data)
    }
  }

  function getStockStatus(ingredient: Ingredient): 'in-stock' | 'low-stock' | 'out-of-stock' {
    if (ingredient.current_stock === 0) return 'out-of-stock'
    if (ingredient.current_stock <= ingredient.low_stock_threshold) return 'low-stock'
    return 'in-stock'
  }

  const filteredIngredients = ingredients.filter((ing) => {
    const matchesSearch = !searchQuery || ing.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesLowStock = !showLowStock || getStockStatus(ing) !== 'in-stock'
    return matchesSearch && matchesLowStock
  })

  return (
    <div className="flex-1 p-8">
      <div className="w-full max-w-7xl mx-auto">
        <header className="flex flex-wrap justify-between items-center gap-4 mb-8">
          <h1 className="text-gray-900 dark:text-white text-3xl font-bold leading-tight">
            Inventory Management
          </h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-primary text-white dark:bg-white dark:text-black text-sm font-medium leading-normal tracking-wide hover:opacity-90 transition-opacity"
            >
              <span className="truncate">+ Add New Ingredient</span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 py-6">
          <div className="lg:col-span-2">
            <label className="flex flex-col min-w-40 h-10 w-full">
              <div className="flex w-full flex-1 items-stretch rounded-lg h-full bg-white dark:bg-black border border-gray-300 dark:border-gray-700 focus-within:border-black dark:focus-within:border-white">
                <div className="text-gray-500 dark:text-gray-400 flex items-center justify-center pl-3">
                  <span className="material-symbols-outlined !text-xl">search</span>
                </div>
                <input
                  className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden text-gray-900 dark:text-white focus:outline-0 focus:ring-0 border-none bg-transparent h-full placeholder:text-gray-500 dark:placeholder:text-gray-400 px-2 text-sm font-normal leading-normal"
                  placeholder="Search by ingredient name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </label>
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

        <div className="overflow-x-auto bg-white dark:bg-black rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm">
          <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead className="text-xs text-gray-700 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-6 py-4 font-medium" scope="col">Name</th>
                <th className="px-6 py-4 font-medium" scope="col">Unit</th>
                <th className="px-6 py-4 font-medium" scope="col">Stock Level</th>
                <th className="px-6 py-4 font-medium" scope="col">Current Stock</th>
                <th className="px-6 py-4 font-medium" scope="col">Cost per Unit</th>
                <th className="px-6 py-4 font-medium" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredIngredients.map((ingredient) => {
                const status = getStockStatus(ingredient)
                return (
                  <tr
                    key={ingredient.id}
                    className="border-b border-gray-200 dark:border-gray-800"
                  >
                    <th
                      className="px-6 py-4 font-medium text-gray-900 dark:text-white whitespace-nowrap"
                      scope="row"
                    >
                      {ingredient.name}
                    </th>
                    <td className="px-6 py-4">{ingredient.unit}</td>
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
                    <td className="px-6 py-4">{ingredient.current_stock}</td>
                    <td className="px-6 py-4">${ingredient.cost.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedIngredient(ingredient)
                          setShowRestockModal(true)
                        }}
                        className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white mr-4"
                      >
                        <span className="material-symbols-outlined">add</span>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
    </div>
  )
}

