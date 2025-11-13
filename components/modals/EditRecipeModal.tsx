'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getProductRecipes, syncProductRecipes } from '@/app/actions/recipes'

type Ingredient = {
  id: string
  name: string
  unit: string
}

type RecipeItem = {
  id?: string
  ingredient_id: string
  ingredient_name: string
  quantity: number
  unit: string
}

type Props = {
  productId: string
  productName: string
  onClose: () => void
  onSuccess: () => void
}

export default function EditRecipeModal({
  productId,
  productName,
  onClose,
  onSuccess,
}: Props) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([])
  const [selectedIngredient, setSelectedIngredient] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadIngredients()
    loadProductRecipes()
  }, [])

  async function loadIngredients() {
    const supabase = createClient()
    const { data } = await supabase
      .from('ingredients')
      .select('id, name, unit')
      .order('name')

    if (data) {
      setIngredients(data)
    }
  }

  async function loadProductRecipes() {
    setIsLoading(true)
    const result = await getProductRecipes(productId)
    if (result.success && result.recipes) {
      setRecipeItems(
        result.recipes.map((r: any) => ({
          id: r.id,
          ingredient_id: r.ingredient_id,
          ingredient_name: r.ingredients?.name || '',
          quantity: r.quantity,
          unit: r.ingredients?.unit || '',
        }))
      )
    }
    setIsLoading(false)
  }

  function handleAddIngredient() {
    if (!selectedIngredient) return

    const ingredient = ingredients.find((i) => i.id === selectedIngredient)
    if (!ingredient) return

    // Check if already added
    if (recipeItems.some((item) => item.ingredient_id === selectedIngredient)) {
      alert('This ingredient is already added to the recipe')
      return
    }

    setRecipeItems([
      ...recipeItems,
      {
        ingredient_id: selectedIngredient,
        ingredient_name: ingredient.name,
        quantity: 0,
        unit: ingredient.unit,
      },
    ])
    setSelectedIngredient('')
  }

  function handleRemoveIngredient(index: number) {
    setRecipeItems(recipeItems.filter((_, i) => i !== index))
  }

  function handleUpdateQuantity(index: number, quantity: number) {
    const updated = [...recipeItems]
    updated[index].quantity = quantity
    setRecipeItems(updated)
  }

  function handleUpdateIngredient(index: number, ingredientId: string) {
    const ingredient = ingredients.find((i) => i.id === ingredientId)
    if (!ingredient) return

    // Check if already added (except current)
    if (
      recipeItems.some(
        (item, i) => item.ingredient_id === ingredientId && i !== index
      )
    ) {
      alert('This ingredient is already added to the recipe')
      return
    }

    const updated = [...recipeItems]
    updated[index].ingredient_id = ingredientId
    updated[index].ingredient_name = ingredient.name
    updated[index].unit = ingredient.unit
    setRecipeItems(updated)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsProcessing(true)

    try {
      // Validate all items have quantities > 0
      const invalidItems = recipeItems.filter((item) => item.quantity <= 0)
      if (invalidItems.length > 0) {
        alert('All ingredients must have a quantity greater than 0')
        setIsProcessing(false)
        return
      }

      const recipes = recipeItems.map((item) => ({
        ingredient_id: item.ingredient_id,
        quantity: item.quantity,
      }))

      const result = await syncProductRecipes(productId, recipes)
      if (result.success) {
        onSuccess()
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-xl border border-gray-200 shadow-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Edit Recipe</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            <div>
              <label
                className="block text-sm font-medium text-gray-700 mb-2"
                htmlFor="product-name"
              >
                Product
              </label>
              <div className="relative">
                <input
                  className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-gray-900 focus:outline-0 focus:ring-2 focus:ring-gray-500 border border-gray-300 bg-input-gray h-10 placeholder:text-gray-500 px-4 text-sm font-normal"
                  disabled
                  id="product-name"
                  type="text"
                  value={productName}
                />
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-700">Ingredients</p>
              {isLoading ? (
                <p className="text-gray-500 text-center py-4">Loading...</p>
              ) : (
                <div className="space-y-3">
                  {recipeItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="sr-only" htmlFor={`ingredient-${index}`}>
                          Ingredient
                        </label>
                        <select
                          id={`ingredient-${index}`}
                          value={item.ingredient_id}
                          onChange={(e) =>
                            handleUpdateIngredient(index, e.target.value)
                          }
                          className="form-select flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-gray-900 focus:outline-0 focus:ring-2 focus:ring-gray-500 border border-gray-300 bg-input-gray h-10 px-4 text-sm font-normal"
                        >
                          <option value="">Select ingredient</option>
                          {ingredients.map((ing) => (
                            <option key={ing.id} value={ing.id}>
                              {ing.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-24">
                        <label className="sr-only" htmlFor={`quantity-${index}`}>
                          Quantity
                        </label>
                        <input
                          id={`quantity-${index}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.quantity || ''}
                          onChange={(e) =>
                            handleUpdateQuantity(
                              index,
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-gray-900 focus:outline-0 focus:ring-2 focus:ring-gray-500 border border-gray-300 bg-input-gray h-10 placeholder:text-gray-500 px-4 text-sm font-normal text-right"
                          placeholder="0"
                        />
                      </div>
                      <div className="w-20">
                        <label className="sr-only" htmlFor={`unit-${index}`}>
                          Unit
                        </label>
                        <input
                          id={`unit-${index}`}
                          type="text"
                          value={item.unit}
                          disabled
                          className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-gray-900 focus:outline-0 focus:ring-2 focus:ring-gray-500 border border-gray-300 bg-input-gray h-10 placeholder:text-gray-500 px-4 text-sm font-normal"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveIngredient(index)}
                        className="text-gray-500 hover:text-red-500 transition-colors flex-shrink-0"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={handleAddIngredient}
                className="flex min-w-[84px] w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-button-gray text-gray-900 text-sm font-medium leading-normal tracking-wide hover:bg-[#D0D0D0] transition-colors border border-gray-200"
              >
                <span className="material-symbols-outlined text-base mr-2">add</span>
                <span className="truncate">Add Ingredient</span>
              </button>

              {ingredients.length > 0 && (
                <div className="mt-2">
                  <select
                    value={selectedIngredient}
                    onChange={(e) => setSelectedIngredient(e.target.value)}
                    className="form-select w-full rounded-lg text-gray-900 bg-input-gray border border-gray-300 focus:border-gray-900 focus:ring-2 focus:ring-gray-900 h-10 px-4 text-sm font-normal"
                  >
                    <option value="">Select ingredient to add...</option>
                    {ingredients
                      .filter(
                        (ing) =>
                          !recipeItems.some(
                            (item) => item.ingredient_id === ing.id
                          )
                      )
                      .map((ing) => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 p-6 bg-gray-50 rounded-b-xl border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-button-gray text-gray-900 text-sm font-medium leading-normal tracking-wide hover:bg-[#D0D0D0] transition-colors border border-gray-200"
            >
              <span className="truncate">Cancel</span>
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-button-gray text-gray-900 text-sm font-medium leading-normal tracking-wide hover:bg-[#D0D0D0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
            >
              <span className="truncate">
                {isProcessing ? 'Saving...' : 'Save Changes'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

