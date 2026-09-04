'use client'

import { useState, useEffect } from 'react'
import { updateIngredient, deleteIngredient } from '@/app/actions/inventory'
import { getSuppliers } from '@/app/actions/suppliers'
import { STANDARD_UNITS, UnitCategory, getUnitsByCategory, calculateBaseYield, getUnitById } from '@/lib/units'

type Ingredient = {
  id: string
  name: string
  unit: string
  category: string | null
  supplier_id: string | null
  low_stock_threshold: number
  purchase_price?: number | null
  purchase_yield?: number | null
  purchase_unit?: string | null
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
  
  // Determine initial measurement category from the base unit
  const initialBaseUnit = getUnitById(ingredient.unit)
  const initialCategory: UnitCategory = initialBaseUnit ? initialBaseUnit.category : 'volume'

  const [formData, setFormData] = useState({
    name: ingredient.name,
    category: ingredient.category || '',
    supplier_id: ingredient.supplier_id || '',
    low_stock_threshold: ingredient.low_stock_threshold === 0 ? '' : ingredient.low_stock_threshold.toString(),
    price: ingredient.purchase_price ? ingredient.purchase_price.toString() : '',
    purchaseQuantity: ingredient.purchase_yield ? (ingredient.purchase_yield / (initialBaseUnit?.multiplierToBase || 1)).toString() : '',
    purchaseUnitId: ingredient.purchase_unit || (initialCategory === 'volume' ? 'L' : 'kg'),
    baseUnitId: ingredient.unit,
    measurementCategory: initialCategory
  })
  
  // Need to correctly deduce original purchase quantity
  useEffect(() => {
    if (ingredient.purchase_yield && ingredient.purchase_unit) {
      const pUnit = getUnitById(ingredient.purchase_unit)
      const bUnit = getUnitById(ingredient.unit)
      if (pUnit && bUnit && pUnit.category === bUnit.category) {
        // purchase_yield = purchase_quantity * pUnit.multiplierToBase / bUnit.multiplierToBase
        // Therefore: purchase_quantity = purchase_yield * bUnit.multiplierToBase / pUnit.multiplierToBase
        const pq = (ingredient.purchase_yield * bUnit.multiplierToBase) / pUnit.multiplierToBase
        setFormData(prev => ({ ...prev, purchaseQuantity: pq.toString() }))
      }
    }
  }, [ingredient])

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    loadSuppliers()
  }, [])

  // Update default units when category changes, but only if they actively click the radio button
  const handleCategoryChange = (newCategory: UnitCategory) => {
    setFormData(prev => ({ 
      ...prev, 
      measurementCategory: newCategory,
      purchaseUnitId: newCategory === 'volume' ? 'L' : 'kg', 
      baseUnitId: newCategory === 'volume' ? 'ml' : 'g' 
    }))
  }

  async function loadSuppliers() {
    const result = await getSuppliers()
    if (result.success) setSuppliers(result.suppliers as Supplier[])
  }
  
  const priceNum = parseFloat(formData.price)
  const purchaseQtyNum = parseFloat(formData.purchaseQuantity)
  
  // Calculate Base Yield and Unit Cost automatically
  const baseYield = (!isNaN(purchaseQtyNum) && purchaseQtyNum > 0) 
    ? calculateBaseYield(purchaseQtyNum, formData.purchaseUnitId, formData.baseUnitId)
    : (ingredient.purchase_yield || 0)

  const calculatedUnitCost = (!isNaN(priceNum) && baseYield > 0) ? priceNum / baseYield : ((ingredient.purchase_price || 0) / (ingredient.purchase_yield || 1))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsProcessing(true)

    try {
      const result = await updateIngredient(ingredient.id, {
        name: formData.name,
        unit: formData.baseUnitId,
        category: formData.category || undefined,
        supplier_id: formData.supplier_id || undefined,
        low_stock_threshold: formData.low_stock_threshold === '' ? 0 : parseFloat(formData.low_stock_threshold),
        purchase_price: isNaN(priceNum) ? null : priceNum,
        purchase_yield: baseYield || null,
        purchase_unit: formData.purchaseUnitId || null,
      })

      if (result.success) onClose()
      else alert(`Error: ${result.error}`)
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const availableUnits = getUnitsByCategory(formData.measurementCategory)

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-2xl rounded-xl bg-white border border-gray-200 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900">Edit Ingredient</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-1 gap-6">
            <label className="flex flex-col">
              <p className="text-sm font-medium text-gray-700 pb-2">Ingredient Name</p>
              <input required className="form-input w-full rounded-lg bg-input-gray border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 h-12 px-4" type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col">
                <p className="text-sm font-medium text-gray-700 pb-2">Category</p>
                <select className="form-select w-full rounded-lg bg-input-gray border-gray-300 h-12 px-4" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                  <option value="">Select category</option>
                  <option value="Coffee Beans">Coffee Beans</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Syrups">Syrups</option>
                  <option value="Disposables">Disposables</option>
                  <option value="Pastries">Pastries</option>
                </select>
              </label>
              <label className="flex flex-col">
                <p className="text-sm font-medium text-gray-700 pb-2">Supplier</p>
                <select className="form-select w-full rounded-lg bg-input-gray border-gray-300 h-12 px-4" value={formData.supplier_id} onChange={e => setFormData({ ...formData, supplier_id: e.target.value })}>
                  <option value="">No supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            </div>

            <div className="p-5 bg-blue-50/40 border border-blue-100 rounded-2xl space-y-5">
              <p className="text-sm font-bold text-blue-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-blue-600">scale</span>
                Measurement & Purchase Info
              </p>

              <div className="flex gap-4 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" className="text-blue-600 focus:ring-blue-600" name="category" checked={formData.measurementCategory === 'volume'} onChange={() => handleCategoryChange('volume')} />
                  <span className="text-sm font-bold text-gray-700">Volume (Liters, ml, etc.)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" className="text-blue-600 focus:ring-blue-600" name="category" checked={formData.measurementCategory === 'weight'} onChange={() => handleCategoryChange('weight')} />
                  <span className="text-sm font-bold text-gray-700">Weight (Kg, g, etc.)</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 bg-white rounded-xl border border-blue-50 shadow-sm">
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-blue-400">1. How you bought it</h4>
                  <label className="flex flex-col">
                    <p className="text-xs font-bold text-gray-600 pb-1.5">Purchase Unit</p>
                    <select required className="form-select w-full rounded-lg bg-gray-50 border-gray-300 h-10 px-3 text-sm font-bold" value={formData.purchaseUnitId} onChange={e => setFormData({ ...formData, purchaseUnitId: e.target.value })}>
                      {availableUnits.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                    </select>
                  </label>
                  <div className="flex gap-3">
                    <label className="flex flex-col flex-1">
                      <p className="text-xs font-bold text-gray-600 pb-1.5">Total Quantity</p>
                      <input required type="number" step="0.01" className="form-input w-full rounded-lg bg-gray-50 border-gray-300 h-10 px-3 text-sm font-bold" value={formData.purchaseQuantity} onChange={e => setFormData({ ...formData, purchaseQuantity: e.target.value })} />
                    </label>
                    <label className="flex flex-col flex-1">
                      <p className="text-xs font-bold text-gray-600 pb-1.5">Total Price (₱)</p>
                      <input required type="number" step="0.01" className="form-input w-full rounded-lg bg-gray-50 border-gray-300 h-10 px-3 text-sm font-bold" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} />
                    </label>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-emerald-500">2. How you use it in Recipes</h4>
                  <label className="flex flex-col">
                    <p className="text-xs font-bold text-gray-600 pb-1.5">Base Unit (Recipe Unit)</p>
                    <select required className="form-select w-full rounded-lg bg-emerald-50/30 border-emerald-200 h-10 px-3 text-sm font-bold" value={formData.baseUnitId} onChange={e => setFormData({ ...formData, baseUnitId: e.target.value })}>
                      {availableUnits.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                    </select>
                  </label>

                  {baseYield > 0 && calculatedUnitCost > 0 && (
                    <div className="p-3 mt-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Auto-Calculated Yield</p>
                      <p className="text-sm font-bold text-emerald-900">{formData.purchaseQuantity} {formData.purchaseUnitId} = <span className="font-black">{baseYield.toLocaleString()} {formData.baseUnitId}</span></p>
                      <p className="text-xs font-bold text-emerald-700 pt-1 border-t border-emerald-100 mt-2">Cost: ₱{calculatedUnitCost.toFixed(4)} / {formData.baseUnitId}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <label className="flex flex-col">
              <div className="flex items-center gap-2 pb-2">
                <p className="text-sm font-medium text-gray-700">Low Stock Alert ({formData.baseUnitId})</p>
              </div>
              <input type="number" step="0.01" className="form-input w-full rounded-lg bg-input-gray border-gray-300 h-12 px-4" placeholder="0" value={formData.low_stock_threshold} onChange={e => setFormData({ ...formData, low_stock_threshold: e.target.value })} />
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl text-sm font-bold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50">Cancel</button>
            <button 
              type="button" 
              disabled={isProcessing}
              onClick={async () => {
                if (confirm('Are you sure you want to delete this ingredient? This action cannot be undone.')) {
                  setIsProcessing(true)
                  const res = await deleteIngredient(ingredient.id)
                  if (res.success) {
                    onClose()
                  } else {
                    alert(res.error)
                  }
                  setIsProcessing(false)
                }
              }}
              className="px-6 py-2.5 rounded-xl text-sm font-bold bg-red-100 text-red-700 border border-red-200 hover:bg-red-200 transition-colors disabled:opacity-50 shadow-sm"
            >
              Delete
            </button>
            <button type="submit" disabled={isProcessing || !formData.name || calculatedUnitCost <= 0} className="px-6 py-2.5 rounded-xl text-sm font-bold bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 shadow-sm">
              {isProcessing ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
