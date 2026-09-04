'use client'

import { useState } from 'react'
import { removeIngredientStock } from '@/app/actions/inventory'

export function useIngredientRemoval() {
  const [isRemoving, setIsRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const removeStock = async (id: string, quantity: number) => {
    setIsRemoving(true)
    setError(null)
    try {
      const result = await removeIngredientStock(id, quantity)
      if (!result.success) {
        setError(result.error || 'Failed to remove stock')
        return false
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      return false
    } finally {
      setIsRemoving(false)
    }
  }

  return { removeStock, isRemoving, error, setError }
}
