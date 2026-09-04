'use client'

import { useState } from 'react'
import { restockIngredient } from '@/app/actions/inventory'

type Ingredient = {
  id: string
  name: string
  unit: string
}

type Props = {
  ingredient: Ingredient
  onClose: () => void
}

export default function RestockModal({ ingredient, onClose }: Props) {
  const [quantity, setQuantity] = useState('')
  const [cost, setCost] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsProcessing(true)

    try {
      const result = await restockIngredient({
        ingredient_id: ingredient.id,
        quantity: parseFloat(quantity),
        total_cost: parseFloat(cost),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-lg rounded-xl bg-white border border-gray-200 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900">
            Restock {ingredient.name}
          </h3>
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
              <p className="text-sm font-medium text-gray-700 pb-2">Quantity ({ingredient.unit})</p>
              <input
                id="restock-quantity"
                name="restock-quantity"
                required
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                className="form-input w-full rounded-lg text-gray-900 bg-input-gray border border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 h-12 px-4 placeholder:text-gray-500 text-base font-normal"
                placeholder="0.00"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>

            <label className="flex flex-col">
              <p className="text-sm font-medium text-gray-700 pb-2">Cost per Unit</p>
              <input
                id="restock-cost"
                name="restock-cost"
                required
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                className="form-input w-full rounded-lg text-gray-900 bg-input-gray border border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 h-12 px-4 placeholder:text-gray-500 text-base font-normal"
                placeholder="0.00"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
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
              {isProcessing ? 'Restocking...' : 'Restock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

