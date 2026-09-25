'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import {
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrderDetails,
  updatePOStatus,
  receiveDelivery,
} from '@/app/actions/purchase-orders'
import { getSuppliers, deleteSupplier } from '@/app/actions/suppliers'
import EditSupplierModal from '@/components/modals/EditSupplierModal'
import AddSupplierModal from '@/components/modals/AddSupplierModal'
import { showConfirm } from '@/components/GlobalConfirm'

type PurchaseOrder = {
  id: string
  store_id: string
  supplier_id: string
  po_number: string
  status: 'pending' | 'received' | 'cancelled'
  total_amount: number
  notes: string | null
  delivery_date: string | null
  created_at: string
  supplier: {
    name: string
  }
  items: Array<{
    id: string
    ingredient_id: string
    quantity: number
    unit_price: number
    received_quantity: number
    ingredient: {
      name: string
      unit: string
    }
  }>
}

type Supplier = {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
}

type Ingredient = {
  id: string
  name: string
  unit: string
}

type POItem = {
  ingredient_id: string
  quantity: number
  unit_price: number
}

export default function PurchasingPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [currentStoreId, setCurrentStoreId] = useState<string | null>(null)
  const [hasStoreAccess, setHasStoreAccess] = useState(false)
  const [accessChecking, setAccessChecking] = useState(true)
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuppliersModal, setShowSuppliersModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false)
  
  // Create form state
  const [formData, setFormData] = useState({
    supplier_id: '',
    notes: '',
    delivery_date: '',
  })
  const [poItems, setPOItems] = useState<POItem[]>([])
  const [selectedIngredient, setSelectedIngredient] = useState('')
  const [itemQuantity, setItemQuantity] = useState('')
  const [itemPrice, setItemPrice] = useState('')

  useEffect(() => {
    async function checkAccess() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setHasStoreAccess(false)
        setError('Please log in to access Purchasing.')
        setAccessChecking(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, store_id')
        .eq('id', user.id)
        .single()

      if (!profile?.store_id || profile.role === 'admin') {
        setHasStoreAccess(false)
        setError('Purchasing is available on the store side only.')
        setAccessChecking(false)
        return
      }

      setCurrentStoreId(profile.store_id)
      setHasStoreAccess(true)
      setAccessChecking(false)
      loadSuppliers()
      loadIngredients()
    }

    checkAccess()
  }, [])

  const loadPurchaseOrders = useCallback(async (storeId?: string, isBackground = false) => {
    const resolvedStoreId = storeId || currentStoreId
    if (!resolvedStoreId) return

    if (!isBackground) setIsLoading(true)
    setError(null)
    
    const result = await listPurchaseOrders(
      resolvedStoreId,
      selectedStatus === 'all' ? undefined : selectedStatus
    )
    
    if (result.success) {
      setPurchaseOrders(result.purchaseOrders)
    } else {
      setError(result.error || 'Failed to load purchase orders')
    }
    
    if (!isBackground) setIsLoading(false)
  }, [currentStoreId, selectedStatus])

  const refreshData = useCallback(() => {
    if (hasStoreAccess && currentStoreId) {
      loadPurchaseOrders(currentStoreId, true)
    }
  }, [hasStoreAccess, currentStoreId, loadPurchaseOrders])

  useAutoRefresh(refreshData, 15000)

  useEffect(() => {
    if (!hasStoreAccess || !currentStoreId) return
    loadPurchaseOrders(currentStoreId)
  }, [selectedStatus, hasStoreAccess, currentStoreId, loadPurchaseOrders])

  async function loadSuppliers() {
    const result = await getSuppliers()
    if (result.success) setSuppliers(result.suppliers as Supplier[])
  }

  async function loadIngredients() {
    const supabase = createClient()
    const { data } = await supabase
      .from('ingredients')
      .select('id, name, unit')
      .order('name')
    if (data) setIngredients(data)
  }

  useEffect(() => {
    if (!hasStoreAccess || !currentStoreId) return
    loadPurchaseOrders(currentStoreId)
  }, [selectedStatus, hasStoreAccess, currentStoreId])

  function addItem() {
    if (!selectedIngredient || !itemQuantity || !itemPrice) return

    const ingredient = ingredients.find((i) => i.id === selectedIngredient)
    if (!ingredient) return

    setPOItems([
      ...poItems,
      {
        ingredient_id: selectedIngredient,
        quantity: parseFloat(itemQuantity),
        unit_price: parseFloat(itemPrice),
      },
    ])

    setSelectedIngredient('')
    setItemQuantity('')
    setItemPrice('')
  }

  function removeItem(index: number) {
    setPOItems(poItems.filter((_, i) => i !== index))
  }

  async function handleCreatePO(e: React.FormEvent) {
    e.preventDefault()
    
    if (poItems.length === 0) {
      setError('Add at least one item')
      return
    }

    setIsLoading(true)
    setError(null)

    const result = await createPurchaseOrder(
      poItems,
      formData.supplier_id,
      formData.notes,
      formData.delivery_date || undefined
    )

    if (result.success) {
      setFormData({ supplier_id: '', notes: '', delivery_date: '' })
      setPOItems([])
      setShowCreateModal(false)
      loadPurchaseOrders(currentStoreId || undefined)
    } else {
      setError(result.error || 'Failed to create purchase order')
    }

    setIsLoading(false)
  }

  async function handleViewPO(po: PurchaseOrder) {
    const result = await getPurchaseOrderDetails(po.id)
    
    if (result.success) {
      setSelectedPO(result.purchaseOrder)
      setShowDetailsModal(true)
    } else {
      setError(result.error || 'Failed to load PO details')
    }
  }

  async function handleMarkReceived() {
    if (!selectedPO) return

    setIsLoading(true)
    setError(null)

    const receivedItems = selectedPO.items.map((item) => ({
      purchase_order_item_id: item.id,
      received_quantity: item.quantity,
    }))

    const result = await receiveDelivery(selectedPO.id, receivedItems)

    if (result.success) {
      setShowDetailsModal(false)
      setSelectedPO(null)
      loadPurchaseOrders(currentStoreId || undefined)
    } else {
      setError(result.error || 'Failed to receive delivery')
    }

    setIsLoading(false)
  }

  async function handleCancelPO(poId: string) {
    if (!(await showConfirm('Are you sure you want to cancel this purchase order?'))) return

    setIsLoading(true)
    setError(null)

    const result = await updatePOStatus(poId, 'cancelled')

    if (result.success) {
      loadPurchaseOrders(currentStoreId || undefined)
    } else {
      setError(result.error || 'Failed to cancel PO')
    }

    setIsLoading(false)
  }

  function getStatusBadge(status: string) {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      received: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    }
    const labels = { pending: 'Pending', received: 'Received', cancelled: 'Cancelled' }
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    )
  }

  const pendingCount = purchaseOrders.filter((po) => po.status === 'pending').length
  const receivedCount = purchaseOrders.filter((po) => po.status === 'received').length
  const cancelledCount = purchaseOrders.filter((po) => po.status === 'cancelled').length

  if (accessChecking) {
    return <div className="p-8 text-center text-gray-500">Loading purchasing...</div>
  }

  if (!hasStoreAccess) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Purchase Orders</h1>
          <p className="text-base text-gray-600 mt-2">Manage supplier orders.</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-base">
          Purchasing is available on the store side only. Use a staff account assigned to a store.
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Purchase Orders</h1>
          <p className="text-base text-gray-600 mt-2">Manage supplier orders.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSuppliersModal(true)}
            className="bg-white border border-gray-300 text-gray-700 text-base font-semibold px-5 py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Manage Suppliers
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white text-base font-semibold px-5 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Create PO
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-5 rounded-lg shadow space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-base uppercase tracking-wide text-yellow-700 font-semibold">Pending</p>
            <p className="text-3xl font-bold text-yellow-800">{pendingCount}</p>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-base uppercase tracking-wide text-green-700 font-semibold">Received</p>
            <p className="text-3xl font-bold text-green-800">{receivedCount}</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-base uppercase tracking-wide text-red-700 font-semibold">Cancelled</p>
            <p className="text-3xl font-bold text-red-800">{cancelledCount}</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <label className="text-lg font-medium text-gray-700">Status:</label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-lg px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-base px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* PO List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading && purchaseOrders.length === 0 ? (
          <div className="p-8 text-center text-base text-gray-500">Loading...</div>
        ) : purchaseOrders.length === 0 ? (
          <div className="p-8 text-center text-base text-gray-500">
            No purchase orders yet. Create your first PO!
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">PO Number</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">Delivery Date</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-base">
              {purchaseOrders.map((po) => (
                <tr key={po.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap font-medium">{po.po_number}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{po.supplier?.name || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(po.status)}</td>
                  <td className="px-6 py-4 whitespace-nowrap font-medium">
                    ₱{po.total_amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {po.delivery_date ? new Date(po.delivery_date).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-base font-medium space-x-2">
                    <button
                      onClick={() => handleViewPO(po)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View
                    </button>
                    {po.status === 'pending' && (
                      <button
                        onClick={() => handleCancelPO(po.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create PO Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col text-base">
            <div className="p-7 border-b flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Create Purchase Order</h2>
                <p className="text-base text-gray-600 mt-1">Add supplier and items.</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreatePO} className="flex-1 overflow-y-auto p-7 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">Supplier *</label>
                  <select
                    required
                    value={formData.supplier_id}
                    onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">Delivery Date</label>
                  <input
                    type="date"
                    value={formData.delivery_date}
                    onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-base font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="Any notes for this order..."
                />
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">Items</label>
                <div className="space-y-3">
                  <div className="flex space-x-2">
                    <select
                      value={selectedIngredient}
                      onChange={(e) => setSelectedIngredient(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select ingredient</option>
                      {ingredients.map((ing) => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name} ({ing.unit})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Qty"
                      value={itemQuantity}
                      onChange={(e) => setItemQuantity(e.target.value)}
                      className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Price"
                      value={itemPrice}
                      onChange={(e) => setItemPrice(e.target.value)}
                      className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={addItem}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                    >
                      Add
                    </button>
                  </div>

                  {poItems.length > 0 && (
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Ingredient</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Qty</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Price</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Total</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {poItems.map((item, index) => {
                          const ingredient = ingredients.find((i) => i.id === item.ingredient_id)
                          return (
                            <tr key={index}>
                              <td className="px-4 py-2">{ingredient?.name}</td>
                              <td className="px-4 py-2 text-right">{item.quantity}</td>
                              <td className="px-4 py-2 text-right">₱{item.unit_price.toFixed(2)}</td>
                              <td className="px-4 py-2 text-right font-medium">
                                ₱{(item.quantity * item.unit_price).toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeItem(index)}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2">
                          <td colSpan={3} className="px-4 py-2 text-right font-bold">
                            Total:
                          </td>
                          <td className="px-4 py-2 text-right font-bold">
                            ₱{poItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0).toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={isLoading || poItems.length === 0}
                >
                  {isLoading ? 'Creating...' : 'Create Purchase Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PO Details Modal */}
      {showDetailsModal && selectedPO && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col text-base">
            <div className="p-7 border-b flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">{selectedPO.po_number}</h2>
                <p className="text-gray-600">{selectedPO.supplier?.name}</p>
              </div>
              <button
                onClick={() => {
                  setShowDetailsModal(false)
                  setSelectedPO(null)
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-7 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border border-gray-200 p-3">
                  <label className="text-sm font-medium text-gray-500 uppercase">Status</label>
                  <div className="mt-1">{getStatusBadge(selectedPO.status)}</div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <label className="text-sm font-medium text-gray-500 uppercase">Total</label>
                  <div className="mt-1 font-semibold text-lg">₱{selectedPO.total_amount.toFixed(2)}</div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <label className="text-sm font-medium text-gray-500 uppercase">Delivery Date</label>
                  <div className="mt-1">
                    {selectedPO.delivery_date ? new Date(selectedPO.delivery_date).toLocaleDateString() : 'Not specified'}
                  </div>
                </div>
              </div>

              {selectedPO.notes && (
                <div>
                  <label className="text-sm font-medium text-gray-500 uppercase">Notes</label>
                  <div className="mt-1 text-gray-900">{selectedPO.notes}</div>
                </div>
              )}

              <div>
                <h3 className="text-lg font-medium mb-3">Items</h3>
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Ingredient</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Ordered</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Price</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {selectedPO.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-2">{item.ingredient?.name}</td>
                        <td className="px-4 py-2 text-right">{item.quantity}</td>
                        <td className="px-4 py-2 text-right">₱{item.unit_price.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-medium">
                          ₱{(item.quantity * item.unit_price).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedPO.status === 'pending' && (
                <div className="flex justify-end">
                  <button
                    onClick={handleMarkReceived}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Processing...' : 'Mark as Received'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Suppliers Manager Modal */}
      {showSuppliersModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">Manage Suppliers</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowAddSupplierModal(true)}
                  className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  + Add Supplier
                </button>
                <button onClick={() => setShowSuppliersModal(false)} className="text-gray-500 hover:text-gray-700 text-2xl">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {suppliers.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No suppliers yet.</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Name</th>
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Contact</th>
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Phone</th>
                      <th className="px-6 py-3 text-right text-sm font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {suppliers.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium">{s.name}</td>
                        <td className="px-6 py-3 text-gray-600">{s.contact_person || '—'}</td>
                        <td className="px-6 py-3 text-gray-600">{s.phone || '—'}</td>
                        <td className="px-6 py-3 text-right space-x-3">
                          <button
                            onClick={() => setEditingSupplier(s)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={async () => {
                              if (!(await showConfirm(`Delete supplier "${s.name}"?`))) return
                              await deleteSupplier(s.id)
                              loadSuppliers()
                            }}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {editingSupplier && (
        <EditSupplierModal
          supplier={editingSupplier}
          onClose={() => setEditingSupplier(null)}
          onSuccess={() => { loadSuppliers(); setEditingSupplier(null) }}
        />
      )}

      {showAddSupplierModal && (
        <AddSupplierModal
          onClose={() => setShowAddSupplierModal(false)}
          onSuccess={() => { loadSuppliers(); setShowAddSupplierModal(false) }}
        />
      )}
    </div>
  )
}
