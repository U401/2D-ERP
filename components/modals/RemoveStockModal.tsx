'use client'

import { useState } from 'react'
import { useIngredientRemoval } from '@/hooks/useIngredientRemoval'

type Props = {
  ingredient: {
    id: string
    name: string
    current: number
    unit: string
  }
  onClose: () => void
  onSuccess: () => void
}

export default function RemoveStockModal({ ingredient, onClose, onSuccess }: Props) {
  const [quantity, setQuantity] = useState<string>('')
  const { removeStock, isRemoving, error, setError } = useIngredientRemoval()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(quantity)
    
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid quantity greater than 0')
      return
    }

    if (amount > ingredient.current) {
      setError(`Cannot remove more than current stock (${ingredient.current} ${ingredient.unit})`)
      return
    }

    const success = await removeStock(ingredient.id, amount)
    if (success) {
      onSuccess()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-6 border-b border-gray-100">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-red-600">remove_circle</span>
              Remove from Stock
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <p className="text-gray-500 text-sm mt-1">{ingredient.name}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm font-medium flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">error</span>
              {error}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
              Quantity to Remove ({ingredient.unit})
            </label>
            <input
              autoFocus
              type="number"
              step="0.01"
              min="0.01"
              max={ingredient.current}
              placeholder="0.00"
              className="block w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-2xl font-bold"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value)
                setError(null)
              }}
            />
            <div className="flex justify-between items-center mt-2">
              <p className="text-xs text-gray-400">Current: {ingredient.current} {ingredient.unit}</p>
              {quantity && !isNaN(parseFloat(quantity)) && (
                <p className="text-xs font-medium text-gray-600">
                  Remaining: {Math.max(0, ingredient.current - parseFloat(quantity)).toFixed(2)} {ingredient.unit}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl bg-gray-100 text-gray-900 font-bold hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isRemoving || !quantity}
              className="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-600/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isRemoving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove Stock'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
