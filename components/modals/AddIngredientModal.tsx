'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addIngredient, getCategories, renameCategory } from '@/app/actions/inventory'
import { getSuppliers, addSupplier as createSupplier, updateSupplier, deleteSupplier } from '@/app/actions/suppliers'
import { STANDARD_UNITS, UnitCategory, getUnitsByCategory, calculateBaseYield } from '@/lib/units'
import { showConfirm } from '@/components/GlobalConfirm'

type Supplier = {
  id: string
  name: string
}

type Props = {
  onClose: () => void
}

type Store = {
  id: string
  name: string
}

export default function AddIngredientModal({ onClose }: Props) {
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    current_stock: '',
    low_stock_threshold: '',
    supplier_id: '',
    store_id: '',
    price: '',
    purchaseQuantity: '',
    purchaseUnitId: 'L',
    baseUnitId: 'ml',
    measurementCategory: 'volume' as UnitCategory
  })
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [userRole, setUserRole] = useState<string | null>(null)
  const [staffStoreId, setStaffStoreId] = useState<string | null | undefined>(undefined)
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Custom Category states
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [isEditingCategory, setIsEditingCategory] = useState(false)
  const [editCategoryName, setEditCategoryName] = useState('')

  // Supplier states
  const [isAddingSupplier, setIsAddingSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [isCreatingSupplier, setIsCreatingSupplier] = useState(false)
  const [isEditingSupplier, setIsEditingSupplier] = useState(false)
  const [editSupplierName, setEditSupplierName] = useState('')

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (formData.measurementCategory === 'volume') {
      setFormData(prev => ({ ...prev, purchaseUnitId: 'L', baseUnitId: 'ml' }))
    } else {
      setFormData(prev => ({ ...prev, purchaseUnitId: 'kg', baseUnitId: 'g' }))
    }
  }, [formData.measurementCategory])

  async function loadInitialData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role, store_id').eq('id', user.id).single()
      setUserRole(profile?.role || 'staff')
      if (profile?.role === 'admin') {
        setStaffStoreId(null)
        const { data: storesData } = await supabase.from('stores').select('id, name').order('name')
        if (storesData) setStores(storesData)
      } else {
        setStaffStoreId(profile?.store_id ?? null)
      }
    }
    const supResult = await getSuppliers()
    if (supResult.success) setSuppliers(supResult.suppliers as Supplier[])
    
    const catResult = await getCategories()
    if (catResult.success) {
      setCategories(catResult.categories || [])
    }
  }

  const priceNum = parseFloat(formData.price)
  const purchaseQtyNum = parseFloat(formData.purchaseQuantity)
  
  const baseYield = (!isNaN(purchaseQtyNum) && purchaseQtyNum > 0) 
    ? calculateBaseYield(purchaseQtyNum, formData.purchaseUnitId, formData.baseUnitId)
    : 0

  const calculatedUnitCost = (!isNaN(priceNum) && baseYield > 0) ? priceNum / baseYield : 0

  async function handleCreateSupplier() {
    if (!newSupplierName.trim()) {
      setIsAddingSupplier(false)
      setFormData(prev => ({ ...prev, supplier_id: '' }))
      return
    }
    setIsCreatingSupplier(true)
    try {
      const result = await createSupplier({ 
        name: newSupplierName.trim(),
        store_id: userRole === 'admin' ? (formData.store_id || undefined) : undefined
      })
      if (result.success && result.supplier) {
        setSuppliers(prev => [...prev, result.supplier as Supplier].sort((a, b) => a.name.localeCompare(b.name)))
        setFormData(prev => ({ ...prev, supplier_id: result.supplier!.id }))
        setIsAddingSupplier(false)
        setNewSupplierName('')
      } else {
        alert('Failed to add supplier: ' + result.error)
      }
    } catch (error) {
      alert('Error creating supplier')
    } finally {
      setIsCreatingSupplier(false)
    }
  }

  async function handleUpdateSupplier() {
    if (!editSupplierName.trim() || !formData.supplier_id) return
    setIsCreatingSupplier(true) // reuse loading state
    try {
      const result = await updateSupplier(formData.supplier_id, { name: editSupplierName.trim() })
      if (result.success && result.supplier) {
        setSuppliers(prev => prev.map(s => s.id === result.supplier!.id ? (result.supplier as Supplier) : s).sort((a, b) => a.name.localeCompare(b.name)))
        setIsEditingSupplier(false)
      } else {
        alert('Failed to update supplier: ' + result.error)
      }
    } catch (error) {
      alert('Error updating supplier')
    } finally {
      setIsCreatingSupplier(false)
    }
  }

  async function handleDeleteSupplier() {
    if (!formData.supplier_id) return
    if (!(await showConfirm('Are you sure you want to delete this supplier? This action cannot be undone.'))) return
    
    setIsCreatingSupplier(true)
    try {
      const result = await deleteSupplier(formData.supplier_id)
      if (result.success) {
        setSuppliers(prev => prev.filter(s => s.id !== formData.supplier_id))
        setFormData(prev => ({ ...prev, supplier_id: '' }))
        setIsEditingSupplier(false)
      } else {
        alert('Failed to delete supplier: ' + result.error)
      }
    } catch (error) {
      alert('Error deleting supplier')
    } finally {
      setIsCreatingSupplier(false)
    }
  }

  async function handleUpdateCategory() {
    if (!editCategoryName.trim() || !formData.category) return
    if (editCategoryName.trim() === formData.category) {
      setIsEditingCategory(false)
      return
    }

    if (!(await showConfirm(`Are you sure you want to rename "${formData.category}" to "${editCategoryName.trim()}" globally?`))) return
    
    const oldCat = formData.category
    const newCat = editCategoryName.trim()
    setIsCreatingSupplier(true)
    try {
      const result = await renameCategory(oldCat, newCat)
      if (result.success) {
        setCategories(prev => {
          const arr = prev.filter(c => c !== oldCat)
          if (!arr.includes(newCat)) arr.push(newCat)
          return arr.sort()
        })
        setFormData(prev => ({ ...prev, category: newCat }))
        setIsEditingCategory(false)
      } else {
        alert('Failed to rename category: ' + result.error)
      }
    } catch (error) {
      alert('Error renaming category')
    } finally {
      setIsCreatingSupplier(false)
    }
  }

  function handleCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === 'add_new') {
      setIsAddingCategory(true)
      setFormData(prev => ({ ...prev, category: '' }))
    } else {
      setFormData(prev => ({ ...prev, category: e.target.value }))
    }
  }

  function handleSupplierChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === 'add_new') {
      setIsAddingSupplier(true)
      setFormData(prev => ({ ...prev, supplier_id: '' }))
    } else {
      setFormData(prev => ({ ...prev, supplier_id: e.target.value }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (userRole === 'admin' && !formData.store_id) {
      alert('Please select a store')
      return
    }
    setIsProcessing(true)
    try {
      const result = await addIngredient({
        name: formData.name,
        unit: formData.baseUnitId,
        category: formData.category || null,
        current_stock: formData.current_stock === '' ? 0 : parseFloat(formData.current_stock),
        low_stock_threshold: formData.low_stock_threshold === '' ? 0 : parseFloat(formData.low_stock_threshold),
        supplier_id: formData.supplier_id || null,
        store_id: formData.store_id || undefined,
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

  const isStaffWithNoStore = userRole !== null && userRole !== 'admin' && staffStoreId === null
  const availableUnits = getUnitsByCategory(formData.measurementCategory)

  // Merge predefined defaults with actual db categories so common ones are always available
  const defaultCategories = ['Coffee Beans', 'Dairy', 'Syrups', 'Disposables', 'Pastries']
  const allCategories = Array.from(new Set([...defaultCategories, ...categories])).sort()

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-2xl rounded-xl bg-white border border-gray-200 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900">Add New Ingredient</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {isStaffWithNoStore ? (
          <div className="p-8 flex flex-col items-center justify-center gap-4 text-center">
            <span className="material-symbols-outlined text-5xl text-amber-400">store_mall_directory</span>
            <h4 className="text-lg font-bold text-gray-900">No Store Assigned</h4>
            <p className="text-sm text-gray-500 max-w-xs">
              You haven&apos;t been assigned to a store yet. Please ask your admin to assign you to a store.
            </p>
            <button onClick={onClose} className="mt-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-gray-900 text-white hover:bg-gray-800">
              Got it
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
            <div className="grid grid-cols-1 gap-6">
              {userRole === 'admin' && (
                <label className="flex flex-col">
                  <p className="text-sm font-medium text-gray-700 pb-2">Assign to Store</p>
                  <select required className="form-select w-full rounded-lg bg-input-gray border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 h-12 px-4" value={formData.store_id} onChange={e => setFormData({ ...formData, store_id: e.target.value })}>
                    <option value="">Select a store</option>
                    {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
                  </select>
                </label>
              )}

              <label className="flex flex-col">
                <p className="text-sm font-medium text-gray-700 pb-2">Ingredient Name</p>
                <input required className="form-input w-full rounded-lg bg-input-gray border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 h-12 px-4" placeholder="e.g., Espresso Beans" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col relative">
                  <div className="flex items-center justify-between pb-2">
                    <p className="text-sm font-medium text-gray-700">Category</p>
                    {formData.category && !isAddingCategory && !isEditingCategory && (
                      <button type="button" onClick={() => { setEditCategoryName(formData.category); setIsEditingCategory(true) }} className="text-xs text-blue-600 hover:text-blue-800 font-semibold">
                        Edit Selected
                      </button>
                    )}
                  </div>
                  
                  {isAddingCategory ? (
                    <div className="flex gap-2">
                      <input 
                        autoFocus
                        className="form-input flex-1 rounded-lg bg-input-gray border-gray-300 h-12 px-4" 
                        placeholder="New category..." 
                        value={newCategoryName} 
                        onChange={e => setNewCategoryName(e.target.value)}
                        onBlur={() => {
                          if (newCategoryName.trim()) {
                            setFormData(prev => ({ ...prev, category: newCategoryName.trim() }))
                          }
                          setIsAddingCategory(false)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            if (newCategoryName.trim()) {
                              setFormData(prev => ({ ...prev, category: newCategoryName.trim() }))
                            }
                            setIsAddingCategory(false)
                          } else if (e.key === 'Escape') {
                            setIsAddingCategory(false)
                            setNewCategoryName('')
                          }
                        }}
                      />
                    </div>
                  ) : isEditingCategory ? (
                     <div className="flex gap-2">
                      <input 
                        autoFocus
                        className="form-input flex-1 rounded-lg bg-input-gray border-gray-300 h-12 px-4" 
                        value={editCategoryName} 
                        onChange={e => setEditCategoryName(e.target.value)}
                        disabled={isCreatingSupplier}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleUpdateCategory()
                          } else if (e.key === 'Escape') {
                            setIsEditingCategory(false)
                          }
                        }}
                      />
                      <button type="button" onClick={handleUpdateCategory} disabled={isCreatingSupplier || !editCategoryName.trim()} className="h-12 px-4 rounded-lg bg-gray-900 text-white font-bold disabled:opacity-50">
                        {isCreatingSupplier ? '...' : 'Save'}
                      </button>
                    </div>
                  ) : (
                    <select className="form-select w-full rounded-lg bg-input-gray border-gray-300 h-12 px-4" value={formData.category} onChange={handleCategoryChange}>
                      <option value="">Select category</option>
                      {allCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      {formData.category && !allCategories.includes(formData.category) && (
                        <option value={formData.category}>{formData.category}</option>
                      )}
                      <option value="add_new" className="font-bold text-blue-600">+ Add new category</option>
                    </select>
                  )}
                </div>

                <div className="flex flex-col relative">
                  <div className="flex items-center justify-between pb-2">
                    <p className="text-sm font-medium text-gray-700">Supplier</p>
                    {formData.supplier_id && !isAddingSupplier && !isEditingSupplier && (
                      <button type="button" onClick={() => {
                        const sup = suppliers.find(s => s.id === formData.supplier_id)
                        if (sup) { setEditSupplierName(sup.name); setIsEditingSupplier(true) }
                      }} className="text-xs text-blue-600 hover:text-blue-800 font-semibold">
                        Edit Selected
                      </button>
                    )}
                  </div>

                  {isAddingSupplier ? (
                    <div className="flex gap-2">
                      <input 
                        autoFocus
                        className="form-input flex-1 rounded-lg bg-input-gray border-gray-300 h-12 px-4" 
                        placeholder="New supplier..." 
                        value={newSupplierName} 
                        onChange={e => setNewSupplierName(e.target.value)}
                        disabled={isCreatingSupplier}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleCreateSupplier()
                          } else if (e.key === 'Escape') {
                            setIsAddingSupplier(false)
                            setNewSupplierName('')
                          }
                        }}
                      />
                      <button 
                        type="button" 
                        onClick={handleCreateSupplier}
                        disabled={isCreatingSupplier || !newSupplierName.trim()}
                        className="h-12 px-4 rounded-lg bg-gray-900 text-white font-bold disabled:opacity-50"
                      >
                        {isCreatingSupplier ? '...' : 'Save'}
                      </button>
                    </div>
                  ) : isEditingSupplier ? (
                    <div className="flex gap-2">
                      <input 
                        autoFocus
                        className="form-input flex-1 rounded-lg bg-input-gray border-gray-300 h-12 px-4" 
                        value={editSupplierName} 
                        onChange={e => setEditSupplierName(e.target.value)}
                        disabled={isCreatingSupplier}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleUpdateSupplier()
                          } else if (e.key === 'Escape') {
                            setIsEditingSupplier(false)
                          }
                        }}
                      />
                      <button type="button" onClick={handleUpdateSupplier} disabled={isCreatingSupplier || !editSupplierName.trim()} className="h-12 px-4 rounded-lg bg-gray-900 text-white font-bold disabled:opacity-50">
                        {isCreatingSupplier ? '...' : 'Save'}
                      </button>
                      <button type="button" onClick={handleDeleteSupplier} disabled={isCreatingSupplier} className="h-12 px-3 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 font-bold disabled:opacity-50" title="Delete Supplier">
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  ) : (
                    <select className="form-select w-full rounded-lg bg-input-gray border-gray-300 h-12 px-4" value={formData.supplier_id} onChange={handleSupplierChange}>
                      <option value="">No supplier</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      <option value="add_new" className="font-bold text-blue-600">+ Add new supplier</option>
                    </select>
                  )}
                </div>
              </div>

              <div className="p-5 bg-blue-50/40 border border-blue-100 rounded-2xl space-y-5">
                <p className="text-sm font-bold text-blue-900 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-blue-600">scale</span>
                  Measurement & Purchase Info
                </p>

                <div className="flex gap-4 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" className="text-blue-600 focus:ring-blue-600" name="category" checked={formData.measurementCategory === 'volume'} onChange={() => setFormData({...formData, measurementCategory: 'volume'})} />
                    <span className="text-sm font-bold text-gray-700">Volume (Liters, ml, etc.)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" className="text-blue-600 focus:ring-blue-600" name="category" checked={formData.measurementCategory === 'weight'} onChange={() => setFormData({...formData, measurementCategory: 'weight'})} />
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
                        <input required type="number" step="0.01" placeholder="e.g. 2" className="form-input w-full rounded-lg bg-gray-50 border-gray-300 h-10 px-3 text-sm font-bold" value={formData.purchaseQuantity} onChange={e => setFormData({ ...formData, purchaseQuantity: e.target.value })} />
                      </label>
                      <label className="flex flex-col flex-1">
                        <p className="text-xs font-bold text-gray-600 pb-1.5">Total Price (₱)</p>
                        <input required type="number" step="0.01" placeholder="e.g. 519" className="form-input w-full rounded-lg bg-gray-50 border-gray-300 h-10 px-3 text-sm font-bold" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} />
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

              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col">
                  <p className="text-sm font-medium text-gray-700 pb-2">Current Stock ({formData.baseUnitId})</p>
                  <input type="number" step="0.01" className="form-input w-full rounded-lg bg-input-gray border-gray-300 h-12 px-4" placeholder="0" value={formData.current_stock} onChange={e => setFormData({ ...formData, current_stock: e.target.value })} />
                </label>
                <label className="flex flex-col">
                  <p className="text-sm font-medium text-gray-700 pb-2">Low Stock Alert ({formData.baseUnitId})</p>
                  <input type="number" step="0.01" className="form-input w-full rounded-lg bg-input-gray border-gray-300 h-12 px-4" placeholder="0" value={formData.low_stock_threshold} onChange={e => setFormData({ ...formData, low_stock_threshold: e.target.value })} />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
              <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl text-sm font-bold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={isProcessing || !formData.name || calculatedUnitCost <= 0} className="px-6 py-2.5 rounded-xl text-sm font-bold bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50">
                {isProcessing ? 'Adding...' : 'Add Ingredient'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
