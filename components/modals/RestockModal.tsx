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
        cost: parseFloat(cost),
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
      <div className="relative w-full max-w-lg rounded-xl bg-[#222222] border border-[#333333] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-[#333333]">
          <h3 className="text-xl font-semibold text-[#F5F5F5]">
            Restock {ingredient.name}
          </h3>
          <button
            onClick={onClose}
            className="text-[#A0A0A0] hover:text-[#FFFFFF] transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 gap-6">
            <label className="flex flex-col">
              <p className="text-sm font-medium text-[#F5F5F5] pb-2">Quantity ({ingredient.unit})</p>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                className="form-input w-full rounded-lg text-white bg-[#181818] border border-[#333333] focus:border-white focus:ring-1 focus:ring-white h-12 px-4 placeholder:text-[#A0A0A0] text-base font-normal"
                placeholder="0.00"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>

            <label className="flex flex-col">
              <p className="text-sm font-medium text-[#F5F5F5] pb-2">Cost per Unit</p>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                className="form-input w-full rounded-lg text-white bg-[#181818] border border-[#333333] focus:border-white focus:ring-1 focus:ring-white h-12 px-4 placeholder:text-[#A0A0A0] text-base font-normal"
                placeholder="0.00"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-4 pt-4 border-t border-[#333333]">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-[#F5F5F5] hover:bg-[#333333] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-primary text-black hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Restocking...' : 'Restock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

