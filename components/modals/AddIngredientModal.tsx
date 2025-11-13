'use client'

import { useState } from 'react'
import { addIngredient } from '@/app/actions/inventory'

type Props = {
  onClose: () => void
}

export default function AddIngredientModal({ onClose }: Props) {
  const [formData, setFormData] = useState({
    name: '',
    unit: '',
    current_stock: 0,
    cost: 0,
    low_stock_threshold: 0,
  })
  const [isProcessing, setIsProcessing] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsProcessing(true)

    try {
      const result = await addIngredient(formData)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-lg rounded-xl bg-white border border-gray-200 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900">Add New Ingredient</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 gap-6">
            <label className="flex flex-col">
              <p className="text-sm font-medium text-gray-700 pb-2">Ingredient Name</p>
              <input
                required
                className="form-input w-full rounded-lg text-gray-900 bg-input-gray border border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 h-12 px-4 placeholder:text-gray-500 text-base font-normal"
                placeholder="e.g., Whole Milk"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </label>

            <label className="flex flex-col">
              <p className="text-sm font-medium text-gray-700 pb-2">Unit of Measure</p>
              <input
                required
                className="form-input w-full rounded-lg text-gray-900 bg-input-gray border border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 h-12 px-4 placeholder:text-gray-500 text-base font-normal"
                placeholder="e.g., kg, L, units"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <label className="flex flex-col">
                <p className="text-sm font-medium text-gray-700 pb-2">Current Stock</p>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-input w-full rounded-lg text-gray-900 bg-input-gray border border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 h-12 px-4 placeholder:text-gray-500 text-base font-normal"
                  placeholder="0"
                  value={formData.current_stock}
                  onChange={(e) =>
                    setFormData({ ...formData, current_stock: parseFloat(e.target.value) || 0 })
                  }
                />
              </label>

              <label className="flex flex-col">
                <p className="text-sm font-medium text-gray-700 pb-2">Cost per Unit</p>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-input w-full rounded-lg text-gray-900 bg-input-gray border border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 h-12 px-4 placeholder:text-gray-500 text-base font-normal"
                  placeholder="0.00"
                  value={formData.cost}
                  onChange={(e) =>
                    setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })
                  }
                />
              </label>
            </div>

            <label className="flex flex-col">
              <div className="flex items-center gap-2 pb-2">
                <p className="text-sm font-medium text-gray-700">Low Stock Threshold</p>
                <div className="group relative flex items-center">
                  <span className="material-symbols-outlined text-sm text-gray-500 cursor-help">
                    help
                  </span>
                  <div className="absolute bottom-full mb-2 w-48 rounded-md bg-gray-800 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    Receive an alert when stock falls to this level.
                  </div>
                </div>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                className="form-input w-full rounded-lg text-gray-900 bg-input-gray border border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 h-12 px-4 placeholder:text-gray-500 text-base font-normal"
                placeholder="0"
                value={formData.low_stock_threshold}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    low_stock_threshold: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-button-gray text-gray-900 hover:bg-[#D0D0D0] transition-colors border border-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-900 hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
            >
              {isProcessing ? 'Adding...' : 'Add Ingredient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

