'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import {
  createStore,
  updateStoreName,
  deleteStore,
  assignUserToStore,
  unassignUserFromStore,
  getStoreDetails,
} from '../../actions/stores'
import { showConfirm } from '@/components/GlobalConfirm'

type Store = {
  id: string
  name: string
  owner_user_id: string
  created_at: string
  profiles?: { username: string }
}

type User = {
  id: string
  username: string
  role: string
  store_id: string | null
}

export default function StoreManagement({ initialStores, initialUsers, isAdmin }: {
  initialStores: Store[]
  initialUsers: User[]
  isAdmin: boolean
}) {
  const [stores, setStores] = useState<Store[]>(initialStores)
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)
  const [storeUsers, setStoreUsers] = useState<User[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Store | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [storeFormData, setStoreFormData] = useState({ name: '' })
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const supabase = createClient()

  // Always fetch fresh data on mount in case the component remounted from a tab switch with stale initialStores
  const fetchFreshData = useCallback(async () => {
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from('stores').select('*').order('name'),
      supabase.from('profiles').select('id, username, email, role, store_id, created_at, active_status')
    ])
    if (s) setStores(s)
    if (p) setUsers(p)
  }, [supabase])

  useEffect(() => {
    fetchFreshData()
  }, [fetchFreshData])

  useAutoRefresh(fetchFreshData, 15000)

  async function loadStoreDetails(store: Store) {
    setLoading(true)
    const { data: storeData, users: storeUsers } = await getStoreDetails(store.id)
    setLoading(false)

    if (storeData && storeUsers) {
      setSelectedStore(storeData)
      setStoreUsers(storeUsers as User[])
      setShowAssignModal(false)
    } else {
      setMessage({ type: 'error', text: 'Failed to load store details' })
    }
  }

  async function handleCreateStore(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const { data: user } = await supabase.auth.getUser()
    if (!user.user) {
      setMessage({ type: 'error', text: 'Not authenticated' })
      setLoading(false)
      return
    }

    const result = await createStore(storeFormData.name, user.user.id)
    setLoading(false)

    if (result.success && result.data) {
      setStores([result.data as Store, ...stores])
      setStoreFormData({ name: '' })
      setShowCreateModal(false)
      setMessage({ type: 'success', text: 'Store created successfully!' })
      setTimeout(() => setMessage(null), 3000)
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to create store' })
    }
  }

  async function handleUpdateStoreName(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedStore) return

    setLoading(true)
    setMessage(null)

    const result = await updateStoreName(selectedStore.id, storeFormData.name)
    setLoading(false)

    if (result.success && result.data) {
      setStores(stores.map(s => s.id === selectedStore.id ? result.data as Store : s))
      if (selectedStore) {
        setSelectedStore(result.data as Store)
      }
      setShowEditModal(false)
      setStoreFormData({ name: '' })
      setMessage({ type: 'success', text: 'Store updated successfully!' })
      setTimeout(() => setMessage(null), 3000)
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update store' })
    }
  }

  async function handleDeleteStore(store: Store) {
    setLoading(true)
    setMessage(null)

    const result = await deleteStore(store.id)
    setLoading(false)

    if (result.success) {
      setStores(stores.filter(s => s.id !== store.id))
      if (selectedStore?.id === store.id) {
        setSelectedStore(null)
        setStoreUsers([])
      }
      setShowDeleteConfirm(null)
      setMessage({ type: 'success', text: 'Store deleted successfully!' })
      setTimeout(() => setMessage(null), 3000)
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to delete store' })
    }
  }

  async function handleAssignUser(user: User) {
    if (!selectedStore) return

    setLoading(true)
    setMessage(null)

    const result = await assignUserToStore(user.id, selectedStore.id)
    setLoading(false)

    if (result.success) {
      setUsers(users.map(u => u.id === user.id ? { ...u, store_id: selectedStore.id } : u))
      setStoreUsers([...storeUsers, user])
      setSelectedUser(null)
      setMessage({ type: 'success', text: `${user.username} assigned to ${selectedStore.name}` })
      setTimeout(() => setMessage(null), 3000)
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to assign user' })
    }
  }

  async function handleUnassignUser(user: User) {
    setLoading(true)
    setMessage(null)

    const result = await unassignUserFromStore(user.id)
    setLoading(false)

    if (result.success) {
      setUsers(users.map(u => u.id === user.id ? { ...u, store_id: null } : u))
      setStoreUsers(storeUsers.filter(u => u.id !== user.id))
      setMessage({ type: 'success', text: `${user.username} unassigned from store` })
      setTimeout(() => setMessage(null), 3000)
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to unassign user' })
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className={`rounded-lg border p-4 ${
          message.type === 'success' 
            ? 'border-green-200 bg-green-50 text-green-900' 
            : 'border-red-200 bg-red-50 text-red-900'
        }`}>
          {message.text}
        </div>
      )}

      {/* Store List */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Stores</h2>
          <button
            type="button"
            onClick={async () => {
              setStoreFormData({ name: '' })
              setShowCreateModal(true)
            }}
            className="px-5 py-3 bg-primary text-white rounded-xl hover:bg-black/80 transition-colors font-medium text-base"
          >
            + Add Store
          </button>
        </div>

        {stores.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium">No stores found</p>
            <p className="text-sm mt-2">Create your first store to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stores.map((store) => (
              <div
                key={store.id}
                className="border border-gray-200 rounded-xl p-6 hover:border-gray-400 hover:shadow-md transition-all cursor-pointer bg-white"
                onClick={async () => loadStoreDetails(store)}
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900 flex-1">{store.name}</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setStoreFormData({ name: store.name })
                        setSelectedStore(store)
                        setShowEditModal(true)
                      }}
                      className="p-2 text-gray-400 hover:text-primary transition-colors flex items-center justify-center"
                      title="Edit store"
                    >
                      <span className="material-symbols-outlined text-[22px]">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowDeleteConfirm(store)
                      }}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors flex items-center justify-center"
                      title="Delete store"
                    >
                      <span className="material-symbols-outlined text-[22px]">delete</span>
                    </button>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>Owner: {store.profiles?.username || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Created: {new Date(store.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Store Details */}
      {selectedStore && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{selectedStore.name}</h2>
              <p className="text-sm text-gray-600 mt-1">Manage users assigned to this store</p>
            </div>
            <button
              type="button"
              onClick={async () => {
                setStoreFormData({ name: '' })
                setShowAssignModal(true)
              }}
              className="px-5 py-3 bg-primary text-white rounded-xl hover:bg-black/80 transition-colors font-medium text-base"
            >
              + Assign User
            </button>
          </div>

          {storeUsers.length === 0 ? (
            <div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
              <p className="text-lg font-medium">No users assigned to this store</p>
              <p className="text-sm mt-2">Assign users to manage this store's data</p>
            </div>
          ) : (
            <div className="space-y-3">
              {storeUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-input-gray flex items-center justify-center text-primary font-bold text-xl">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-lg">{user.username}</p>
                      <p className="text-sm text-gray-600">Role: {user.role}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (await showConfirm(`Unassign ${user.username} from ${selectedStore.name}?`)) {
                        handleUnassignUser(user)
                      }
                    }}
                    className="px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors font-medium text-base"
                  >
                    Unassign
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Store Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Create New Store</h3>
            <form onSubmit={handleCreateStore} className="space-y-4">
              <div>
                <label htmlFor="storeName" className="block text-sm font-medium text-gray-700 mb-1">
                  Store Name
                </label>
                <input
                  id="storeName"
                  type="text"
                  required
                  minLength={2}
                  value={storeFormData.name}
                  onChange={(e) => setStoreFormData({ name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Downtown Coffee Shop"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    setShowCreateModal(false)
                    setStoreFormData({ name: '' })
                    setMessage(null)
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-5 py-3 bg-primary text-white rounded-xl hover:bg-black/80 transition-colors font-medium text-base disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Store'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Store Modal */}
      {showEditModal && selectedStore && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Edit Store Name</h3>
            <form onSubmit={handleUpdateStoreName} className="space-y-4">
              <div>
                <label htmlFor="editStoreName" className="block text-sm font-medium text-gray-700 mb-1">
                  Store Name
                </label>
                <input
                  id="editStoreName"
                  type="text"
                  required
                  minLength={2}
                  value={storeFormData.name}
                  onChange={(e) => setStoreFormData({ name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Downtown Coffee Shop"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    setShowEditModal(false)
                    setStoreFormData({ name: '' })
                    setMessage(null)
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-5 py-3 bg-primary text-white rounded-xl hover:bg-black/80 transition-colors font-medium text-base disabled:opacity-50"
                >
                  {loading ? 'Updating...' : 'Update Store'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign User Modal */}
      {showAssignModal && selectedStore && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Assign User to {selectedStore.name}</h3>
            
            {users.filter(u => u.store_id !== selectedStore.id).length === 0 ? (
              <p className="text-center py-8 text-gray-500">No available users to assign</p>
            ) : (
              <div className="space-y-2 mb-4">
                {users
                  .filter(u => u.store_id !== selectedStore.id)
                  .map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={async () => handleAssignUser(user)}
                      className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all text-left"
                    >
                      <div className="w-12 h-12 rounded-full bg-input-gray flex items-center justify-center text-primary font-bold text-xl">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-900 text-lg">{user.username}</p>
                        <p className="text-sm text-gray-600">Role: {user.role}</p>
                      </div>
                      <span className="material-symbols-outlined text-gray-400 text-2xl">chevron_right</span>
                    </button>
                  ))}
              </div>
            )}

            <button
              type="button"
              onClick={async () => {
                setShowAssignModal(false)
                setMessage(null)
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-red-600 mb-2">Delete Store?</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete <strong>{showDeleteConfirm.name}</strong>?<br />
              <span className="text-sm text-red-600">This will permanently delete all data (products, sales, inventory, etc.) associated with this store.</span>
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={async () => {
                  setShowDeleteConfirm(null)
                  setMessage(null)
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => handleDeleteStore(showDeleteConfirm)}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50"
              >
                {loading ? 'Deleting...' : 'Delete Store'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

