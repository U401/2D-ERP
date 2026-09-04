'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Customization } from '@/app/(shell)/pos/page'

type Ingredient = {
    id: string
    name: string
    unit: string
    base_quantity: number
}

type CustomizationModalProps = {
    isOpen: boolean
    productId: string
    onClose: () => void
    onSave: (customizations: Customization[]) => void
    initialCustomizations?: Customization[]
}

export default function CustomizationModal({ isOpen, productId, onClose, onSave, initialCustomizations = [] }: CustomizationModalProps) {
    const [ingredients, setIngredients] = useState<Ingredient[]>([])
    const [customizations, setCustomizations] = useState<Customization[]>(initialCustomizations)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (isOpen && productId) {
            setCustomizations(initialCustomizations)
            loadProductIngredients()
        }
    }, [isOpen, productId])

    async function loadProductIngredients() {
        setLoading(true)
        const supabase = createClient()

        // Fetch only the ingredients that belong to this product's recipe
        const { data } = await supabase
            .from('recipes')
            .select(`
                quantity,
                ingredients (
                    id,
                    name,
                    unit
                )
            `)
            .eq('product_id', productId)

        if (data) {
            const mapped = data
                .filter(r => r.ingredients)
                .map(r => ({
                    id: (r.ingredients as any).id,
                    name: (r.ingredients as any).name,
                    unit: (r.ingredients as any).unit,
                    base_quantity: parseFloat(r.quantity),
                }))
                .sort((a, b) => a.name.localeCompare(b.name))
            setIngredients(mapped)
        }
        setLoading(false)
    }

    function handleDeltaChange(ingredient: Ingredient, delta: number) {
        setCustomizations(prev => {
            const existing = prev.find(c => c.ingredient_id === ingredient.id)
            if (existing) {
                const newDelta = parseFloat((existing.delta + delta).toFixed(2))
                if (newDelta === 0) {
                    return prev.filter(c => c.ingredient_id !== ingredient.id)
                }
                return prev.map(c => c.ingredient_id === ingredient.id ? { ...c, delta: newDelta } : c)
            }
            return [...prev, { ingredient_id: ingredient.id, name: ingredient.name, delta, price_adjustment: 0 }]
        })
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl border border-gray-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Customize Order</h2>
                        <p className="text-sm text-gray-500 mt-0.5">Adjust ingredients for this item</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                    >
                        <span className="material-symbols-outlined text-gray-500" style={{ fontSize: '20px' }}>close</span>
                    </button>
                </div>

                {/* Ingredient List */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
                        </div>
                    ) : ingredients.length === 0 ? (
                        <div className="text-center py-12">
                            <span className="material-symbols-outlined text-gray-300" style={{ fontSize: '48px' }}>blender</span>
                            <p className="text-gray-400 mt-2 text-sm">No recipe ingredients found for this product.</p>
                        </div>
                    ) : (
                        ingredients.map(ing => {
                            const current = customizations.find(c => c.ingredient_id === ing.id)
                            const currentDelta = current?.delta || 0
                            const isModified = currentDelta !== 0

                            return (
                                <div
                                    key={ing.id}
                                    className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                                        isModified
                                            ? 'bg-gray-50 border-gray-300'
                                            : 'bg-white border-gray-100 hover:border-gray-200'
                                    }`}
                                >
                                    <div className="min-w-0 mr-4">
                                        <p className="font-semibold text-gray-900 text-base leading-tight">{ing.name}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            Base: {ing.base_quantity} {ing.unit}
                                            {isModified && (
                                                <span className={`ml-2 font-bold ${currentDelta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                    {currentDelta > 0 ? `+${currentDelta}` : currentDelta} {ing.unit}
                                                </span>
                                            )}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            onClick={() => handleDeltaChange(ing, -1)}
                                            className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 flex items-center justify-center text-gray-700 font-bold text-lg transition-all"
                                        >
                                            −
                                        </button>
                                        <button
                                            onClick={() => handleDeltaChange(ing, -0.5)}
                                            className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 flex items-center justify-center text-gray-600 font-medium text-xs transition-all"
                                        >
                                            -½
                                        </button>
                                        <span className={`w-12 text-center text-sm font-bold transition-colors ${
                                            isModified ? (currentDelta > 0 ? 'text-emerald-600' : 'text-red-500') : 'text-gray-400'
                                        }`}>
                                            {currentDelta > 0 ? `+${currentDelta}` : currentDelta === 0 ? '0' : currentDelta}
                                        </span>
                                        <button
                                            onClick={() => handleDeltaChange(ing, 0.5)}
                                            className="w-9 h-9 rounded-xl bg-gray-800 hover:bg-gray-700 active:scale-95 flex items-center justify-center text-white font-medium text-xs transition-all"
                                        >
                                            +½
                                        </button>
                                        <button
                                            onClick={() => handleDeltaChange(ing, 1)}
                                            className="w-9 h-9 rounded-xl bg-gray-800 hover:bg-gray-700 active:scale-95 flex items-center justify-center text-white font-bold text-lg transition-all"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 px-4 rounded-xl bg-gray-100 text-gray-700 font-semibold text-base hover:bg-gray-200 transition-all active:scale-95"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            onSave(customizations)
                            onClose()
                        }}
                        className="flex-1 py-3 px-4 rounded-xl bg-gray-900 text-white font-bold text-base hover:bg-gray-800 transition-all active:scale-95 shadow-sm"
                    >
                        Save Adjustments
                    </button>
                </div>
            </div>
        </div>
    )
}
