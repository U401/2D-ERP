'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  createCustomer,
  getCustomers,
  updateCustomer,
  getCustomerHistory,
} from '@/app/actions/customers'

type Customer = {
  id: string
  store_id: string
  name: string
  phone: string
  email: string | null
  address: string | null
  created_at: string
  updated_at: string
}

type Sale = {
  id: string
  total_amount: number
  sold_at: string
  payment_method: string
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerHistory, setCustomerHistory] = useState<Sale[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
  })
  
  const [editFormData, setEditFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
  })

  useEffect(() => {
    loadCustomers()
  }, [])

  async function loadCustomers() {
    setIsLoading(true)
    setError(null)
    
    const result = await getCustomers(searchQuery || undefined)
    
    if (result.success) {
      setCustomers(result.customers)
    } else {
      setError(result.error || 'Failed to load customers')
    }
    
    setIsLoading(false)
  }

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers()
    }, 500)
    
    return () => clearTimeout(timer)
  }, [searchQuery])

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault()
    
    setIsLoading(true)
    setError(null)

    const result = await createCustomer(
      formData.name,
      formData.phone,
      formData.email || null,
      formData.address || null
    )

    if (result.success) {
      setFormData({ name: '', phone: '', email: '', address: '' })
      setShowAddModal(false)
      loadCustomers()
    } else {
      setError(result.error || 'Failed to add customer')
    }

    setIsLoading(false)
  }

  async function handleUpdateCustomer(e: React.FormEvent) {
    e.preventDefault()
    
    if (!selectedCustomer) return

    setIsLoading(true)
    setError(null)

    const result = await updateCustomer(selectedCustomer.id, {
      name: editFormData.name || selectedCustomer.name,
      phone: editFormData.phone || selectedCustomer.phone,
      email: editFormData.email !== '' ? editFormData.email : null,
      address: editFormData.address !== '' ? editFormData.address : null,
    })

    if (result.success) {
      setSelectedCustomer(null)
      setEditFormData({ name: '', phone: '', email: '', address: '' })
      loadCustomers()
    } else {
      setError(result.error || 'Failed to update customer')
    }

    setIsLoading(false)
  }

  async function handleViewHistory(customer: Customer) {
    setSelectedCustomer(customer)
    setShowHistoryModal(true)
    
    const result = await getCustomerHistory(customer.id)
    
    if (result.success) {
      setCustomerHistory(result.sales)
    } else {
      setError(result.error || 'Failed to load customer history')
    }
  }

  function openEditModal(customer: Customer) {
    setSelectedCustomer(customer)
    setEditFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      address: customer.address || '',
    })
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Customers</h1>
          <p className="text-gray-600 mt-1">Manage customer records.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Customer
        </button>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-lg shadow">
        <input
          type="text"
          placeholder="Search by name or phone number..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Customers List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading && customers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : customers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchQuery ? 'No customers match your search' : 'No customers yet'}
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{customer.name}</div>
                    <div className="text-xs text-gray-500">
                      Added: {new Date(customer.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-900">{customer.phone}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-900">{customer.email || '-'}</td>
                  <td className="px-6 py-4 text-gray-900">{customer.address || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleViewHistory(customer)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      History
                    </button>
                    <button
                      onClick={() => openEditModal(customer)}
                      className="text-green-600 hover:text-green-900"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 text-base">
            <div className="p-7 border-b">
              <h2 className="text-2xl font-bold">Add New Customer</h2>
            </div>
            <form onSubmit={handleAddCustomer} className="p-7 space-y-5">
              <div>
                <label className="block text-base font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-base font-medium text-gray-700 mb-1">Phone *</label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="09123456789"
                />
              </div>
              <div>
                <label className="block text-base font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="customer@email.com"
                />
              </div>
              <div>
                <label className="block text-base font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="Customer address"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={isLoading}
                >
                  {isLoading ? 'Adding...' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {selectedCustomer && !showHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 text-base">
            <div className="p-7 border-b">
              <h2 className="text-2xl font-bold">Edit Customer</h2>
            </div>
            <form onSubmit={handleUpdateCustomer} className="p-7 space-y-5">
              <div>
                <label className="block text-base font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-base font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-base font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-base font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  value={editFormData.address}
                  onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={isLoading}
                >
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer History Modal */}
      {showHistoryModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col text-base">
            <div className="p-7 border-b flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Order History</h2>
                <p className="text-gray-600">{selectedCustomer.name} - {selectedCustomer.phone}</p>
              </div>
              <button
                onClick={() => {
                  setShowHistoryModal(false)
                  setSelectedCustomer(null)
                  setCustomerHistory([])
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {customerHistory.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No orders yet</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b sticky top-0">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">Payment Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {customerHistory.map((sale) => (
                      <tr key={sale.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          {new Date(sale.sold_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-medium">
                          ₱{sale.total_amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-900 capitalize">
                          {sale.payment_method}
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
    </div>
  )
}
