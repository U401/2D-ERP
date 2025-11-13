'use client'

import { useState, useEffect } from 'react'
import { updateIngredient } from '@/app/actions/inventory'
import { getSuppliers } from '@/app/actions/suppliers'

type Ingredient = {
  id: string
  name: string
  unit: string
  category: string | null
  supplier_id: string | null
  cost: number
  low_stock_threshold: number
}

type Supplier = {
  id: string
  name: string
}

type Props = {
  ingredient: Ingredient
  onClose: () => void
}

export default function EditIngredientModal({ ingredient, onClose }: Props) {
  const [formData, setFormData] = useState({
    name: ingredient.name,
    unit: ingredient.unit,
    category: ingredient.category || '',
    supplier_id: ingredient.supplier_id || '',
    cost: ingredient.cost === 0 ? '' : ingredient.cost,
    low_stock_threshold: ingredient.low_stock_threshold === 0 ? '' : ingredient.low_stock_threshold,
  })
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    loadSuppliers()
  }, [])

  async function loadSuppliers() {
    const result = await getSuppliers()
    if (result.success) {
      setSuppliers(result.suppliers as Supplier[])
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsProcessing(true)

    try {
      const result = await updateIngredient(ingredient.id, {
        name: formData.name,
        unit: formData.unit,
        category: formData.category || null,
        supplier_id: formData.supplier_id || null,
        cost: typeof formData.cost === 'string' ? 0 : formData.cost,
        low_stock_threshold: typeof formData.low_stock_threshold === 'string' ? 0 : formData.low_stock_threshold,
      })

      if (result.success) {
        onClose()
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md p-6 bg-background-light rounded-xl shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">
            Edit Ingredient
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label
                className="block text-sm font-medium text-gray-700 mb-1.5"
                htmlFor="ingredient-name"
              >
                Ingredient Name
              </label>
              <input
                required
                className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden text-gray-900 focus:outline-0 focus:ring-0 border-gray-300 bg-input-gray h-10 placeholder:text-gray-500 px-3 text-sm font-normal leading-normal rounded-lg focus:ring-2 focus:ring-black"
                id="ingredient-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium text-gray-700 mb-1.5"
                htmlFor="category"
              >
                Category
              </label>
              <select
                className="form-select flex w-full min-w-0 flex-1 resize-none overflow-hidden text-gray-900 focus:outline-0 focus:ring-0 border-gray-300 bg-input-gray h-10 px-3 text-sm font-normal leading-normal rounded-lg focus:ring-2 focus:ring-black"
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="">Select category</option>
                <option value="Coffee Beans">Coffee Beans</option>
                <option value="Dairy">Dairy</option>
                <option value="Syrups">Syrups</option>
                <option value="Disposables">Disposables</option>
                <option value="Pastries">Pastries</option>
              </select>
            </div>

            <div>
              <label
                className="block text-sm font-medium text-gray-700 mb-1.5"
                htmlFor="supplier"
              >
                Supplier
              </label>
              <select
                className="form-select flex w-full min-w-0 flex-1 resize-none overflow-hidden text-gray-900 focus:outline-0 focus:ring-0 border-gray-300 bg-input-gray h-10 px-3 text-sm font-normal leading-normal rounded-lg focus:ring-2 focus:ring-black"
                id="supplier"
                value={formData.supplier_id}
                onChange={(e) =>
                  setFormData({ ...formData, supplier_id: e.target.value || null })
                }
              >
                <option value="">No supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                  htmlFor="unit"
                >
                  Unit
                </label>
                <input
                  required
                  className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden text-gray-900 focus:outline-0 focus:ring-0 border-gray-300 bg-input-gray h-10 placeholder:text-gray-500 px-3 text-sm font-normal leading-normal rounded-lg focus:ring-2 focus:ring-black"
                  id="unit"
                  type="text"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                  htmlFor="cost"
                >
                  Cost per Unit
                </label>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden text-gray-900 focus:outline-0 focus:ring-0 border-gray-300 bg-input-gray h-10 placeholder:text-gray-500 px-3 text-sm font-normal leading-normal rounded-lg focus:ring-2 focus:ring-black"
                  id="cost"
                  value={formData.cost === '' ? '' : formData.cost}
                  onChange={(e) =>
                    setFormData({ 
                      ...formData, 
                      cost: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 
                    })
                  }
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-button-gray text-gray-900 text-sm font-medium leading-normal tracking-wide border border-gray-200 hover:bg-[#D0D0D0] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-gray-100 text-gray-900 text-sm font-medium leading-normal tracking-wide hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
            >
              {isProcessing ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

