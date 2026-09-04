'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

type Profile = {
    id: string
    username: string
    role: string
    phone: string | null
    store_id: string | null
}

type Store = {
    id: string
    name: string
}

export default function UserManagement({ profiles: initialProfiles, stores: initialStores }: { profiles: Profile[], stores?: Store[] }) {
    const [profiles, setProfiles] = useState<Profile[]>(initialProfiles)
    const [stores, setStores] = useState<Store[]>(initialStores || [])
    const [isCreating, setIsCreating] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editForm, setEditForm] = useState<{ username: string; role: string; store_id: string; newPassword: string }>({ username: '', role: 'staff', store_id: '', newPassword: '' })
    const [message, setMessage] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const supabase = createClient()

    // Always fetch fresh data on mount in case the component remounted from a tab switch with stale initial data
    const fetchFreshData = useCallback(async () => {
        const [{ data: s }, { data: p }] = await Promise.all([
            supabase.from('stores').select('*').order('name'),
            supabase.from('profiles').select('*')
        ])
        if (s) setStores(s)
        if (p) setProfiles(p)
    }, [supabase])

    useEffect(() => {
        fetchFreshData()
    }, [fetchFreshData])

    useAutoRefresh(fetchFreshData, 15000)

    useEffect(() => {
        let isMounted = true
        supabase.auth.getUser().then(({ data }) => {
            if (!isMounted) return
            setCurrentUserId(data.user?.id ?? null)
        })
        return () => { isMounted = false }
    }, [supabase])

    function startEditing(profile: Profile) {
        setEditingId(profile.id)
        setEditForm({
            username: profile.username,
            role: profile.role,
            store_id: profile.store_id || '',
            newPassword: '',
        })
        setMessage(null)
    }

    async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setMessage(null)
        const formData = new FormData(e.currentTarget)
        const username = formData.get('username') as string
        const password = formData.get('password') as string
        const role = formData.get('role') as string

        const { data, error } = await supabase.functions.invoke('admin-actions', {
            body: { action: 'create_user', username, password, role }
        })

        if (error || data?.error) {
            setMessage(error?.message || data?.error)
        } else {
            setMessage('User created successfully')
            setIsCreating(false)
            await fetchFreshData()
        }
    }

    async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setMessage(null)
        setIsSaving(true)

        try {
            // 1. Update username via edge function (also updates auth email)
            if (editForm.username !== profiles.find(p => p.id === editingId)?.username) {
                const { data, error } = await supabase.functions.invoke('admin-actions', {
                    body: { action: 'update_username', userId: editingId, newUsername: editForm.username }
                })
                if (error || data?.error) {
                    setMessage(error?.message || data?.error)
                    setIsSaving(false)
                    return
                }
            }

            // 2. Update role and store_id directly in profiles
            const updates: Record<string, any> = {
                role: editForm.role,
                store_id: editForm.store_id || null,
            }
            const { error: profileError } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', editingId!)

            if (profileError) {
                setMessage(`Failed to update profile: ${profileError.message}`)
                setIsSaving(false)
                return
            }

            // 3. Optionally update password
            if (editForm.newPassword.trim()) {
                const { data, error } = await supabase.functions.invoke('admin-actions', {
                    body: { action: 'update_password', userId: editingId, newPassword: editForm.newPassword }
                })
                if (error || data?.error) {
                    setMessage(error?.message || data?.error)
                    setIsSaving(false)
                    return
                }
            }

            setMessage('Account updated successfully')
            setEditingId(null)
            await fetchFreshData()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleDelete(profile: Profile) {
        if (currentUserId && profile.id === currentUserId) {
            setMessage('You cannot delete your own account.')
            return
        }

        const username = profile.username || profile.id

        if (!confirm(`Delete user "${username}"?\n\nThis will remove the user from Auth and the ERP. This cannot be undone.`)) {
            return
        }

        setMessage(null)
        setDeletingId(profile.id)

        try {
            const { data, error } = await supabase.functions.invoke('admin-actions', {
                body: { action: 'delete_user', userId: profile.id }
            })

            if (error || data?.error) {
                setMessage(error?.message || data?.error || 'Failed to delete user')
                return
            }

            setMessage(`User "${username}" deleted successfully`)
            await fetchFreshData()
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mt-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-900">User Management</h2>
                <button
                    onClick={() => { setIsCreating(!isCreating); setMessage(null) }}
                    className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
                >
                    {isCreating ? 'Cancel' : 'Add User'}
                </button>
            </div>

            {message && (
                <div className={`mb-4 p-3 rounded-lg text-sm ${message.toLowerCase().includes('error') || message.toLowerCase().includes('fail') ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                    {message}
                </div>
            )}

            {isCreating && (
                <form onSubmit={handleCreate} className="mb-8 p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <h3 className="font-medium mb-4 text-slate-900">Create New User</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <input
                            name="username"
                            placeholder="Username (e.g. Branch-1)"
                            required
                            className="border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        />
                        <input
                            name="password"
                            type="password"
                            placeholder="Password"
                            required
                            className="border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        />
                        <select name="role" className="border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-slate-900 focus:outline-none">
                            <option value="staff">Staff</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <button type="submit" className="mt-4 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
                        Create User
                    </button>
                </form>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse block md:table">
                    <thead className="hidden md:table-header-group">
                        <tr className="border-b border-slate-200">
                            <th className="pb-3 font-medium text-slate-500">Username</th>
                            <th className="pb-3 font-medium text-slate-500">Role</th>
                            <th className="pb-3 font-medium text-slate-500">Store</th>
                            <th className="pb-3 font-medium text-slate-500">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="block md:table-row-group divide-y divide-slate-100">
                        {profiles.map((profile) => (
                            <tr key={profile.id} className="block md:table-row py-4 md:py-0 border-b border-slate-100 md:border-none">
                                <td className="block md:table-cell py-1 md:py-3 pr-4">
                                    <span className="md:hidden font-medium text-slate-500 text-xs uppercase mr-2">Username:</span>
                                    <span className="font-medium text-slate-900">{profile.username}</span>
                                </td>
                                <td className="block md:table-cell py-1 md:py-3 pr-4">
                                    <span className="md:hidden font-medium text-slate-500 text-xs uppercase mr-2">Role:</span>
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${profile.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-800'}`}>
                                        {profile.role}
                                    </span>
                                </td>
                                <td className="block md:table-cell py-1 md:py-3 pr-4 text-sm text-slate-600">
                                    <span className="md:hidden font-medium text-slate-500 text-xs uppercase mr-2">Store:</span>
                                    {stores?.find(s => s.id === profile.store_id)?.name || <span className="text-slate-400 italic">Unassigned</span>}
                                </td>
                                <td className="block md:table-cell py-2 md:py-3">
                                    <div className="flex items-center gap-4 md:gap-3">
                                        {editingId !== profile.id && (
                                            <button
                                                onClick={() => startEditing(profile)}
                                                className="text-blue-600 hover:text-blue-800 text-sm font-medium bg-blue-50 px-3 py-1.5 rounded-md md:bg-transparent md:p-0"
                                            >
                                                Edit
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(profile)}
                                            disabled={deletingId === profile.id || (currentUserId ? profile.id === currentUserId : false)}
                                            className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed bg-red-50 px-3 py-1.5 rounded-md md:bg-transparent md:p-0"
                                        >
                                            {currentUserId && profile.id === currentUserId
                                                ? 'You'
                                                : (deletingId === profile.id ? 'Deleting…' : 'Delete')}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Edit Modal */}
            {editingId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
                        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
                            <h3 className="text-lg font-bold text-slate-900">Edit Account</h3>
                            <button onClick={() => { setEditingId(null); setMessage(null) }} className="text-slate-400 hover:text-slate-700">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleUpdate} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                                <input
                                    value={editForm.username}
                                    onChange={e => setEditForm({ ...editForm, username: e.target.value })}
                                    required
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                                <select
                                    value={editForm.role}
                                    onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                                >
                                    <option value="staff">Staff</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Assigned Store</label>
                                <select
                                    value={editForm.store_id}
                                    onChange={e => setEditForm({ ...editForm, store_id: e.target.value })}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                                >
                                    <option value="">— No store —</option>
                                    {(stores || []).map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">New Password <span className="text-slate-400 font-normal">(leave blank to keep current)</span></label>
                                <input
                                    type="password"
                                    value={editForm.newPassword}
                                    onChange={e => setEditForm({ ...editForm, newPassword: e.target.value })}
                                    placeholder="Enter new password"
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                                />
                            </div>
                            {message && (
                                <p className={`text-sm ${message.toLowerCase().includes('success') ? 'text-green-700' : 'text-red-600'}`}>{message}</p>
                            )}
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => { setEditingId(null); setMessage(null) }} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-60">
                                    {isSaving ? 'Saving…' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
