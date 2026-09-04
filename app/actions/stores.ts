'use client'

import { createClient } from '@/lib/supabase/client'

/**
 * Create a new store
 * @param name - Store name
 * @param ownerId - User ID who will own the store
 */
export async function createStore(name: string, ownerId: string) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('stores')
    .insert({
      name: name.trim(),
      owner_user_id: ownerId,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating store:', error)
    return { success: false, error: error.message, data: null }
  }

  return { success: true, error: null, data }
}

/**
 * Update store name
 * @param storeId - Store ID to update
 * @param name - New store name
 */
export async function updateStoreName(storeId: string, name: string) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', data: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { success: false, error: 'Only admins can update store names', data: null }
  }

  const { data, error } = await supabase
    .from('stores')
    .update({ name: name.trim() })
    .eq('id', storeId)
    .select()
    .single()

  if (error) {
    console.error('Error updating store:', error)
    return { success: false, error: error.message, data: null }
  }

  return { success: true, error: null, data }
}

/**
 * Delete a store
 * @param storeId - Store ID to delete
 * Note: This will cascade delete all related data (products, sales, etc.)
 */
export async function deleteStore(storeId: string) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { success: false, error: 'Only admins can delete stores' }
  }

  const { error } = await supabase
    .from('stores')
    .delete()
    .eq('id', storeId)

  if (error) {
    console.error('Error deleting store:', error)
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

/**
 * Assign a user to a store
 * @param userId - User ID to assign
 * @param storeId - Store ID to assign to
 */
export async function assignUserToStore(userId: string, storeId: string) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', data: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { success: false, error: 'Only admins can assign users to stores', data: null }
  }

  // Call ensure_store_for_user to allow store_id update
  await supabase.rpc('ensure_store_for_user', {
    p_store_name: null,
  })

  // Now update the store_id
  const { data, error } = await supabase
    .from('profiles')
    .update({ store_id: storeId })
    .eq('id', userId)
    .select()
    .single()

  if (error) {
    console.error('Error assigning user to store:', error)
    return { success: false, error: error.message, data: null }
  }

  return { success: true, error: null, data }
}

/**
 * Unassign user from store (set store_id to null)
 * @param userId - User ID to unassign
 */
export async function unassignUserFromStore(userId: string) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', data: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { success: false, error: 'Only admins can unassign users from stores', data: null }
  }

  // Call ensure_store_for_user to allow store_id update
  await supabase.rpc('ensure_store_for_user', {
    p_store_name: null,
  })

  // Clear the store_id
  const { data, error } = await supabase
    .from('profiles')
    .update({ store_id: null })
    .eq('id', userId)
    .select()
    .single()

  if (error) {
    console.error('Error unassigning user from store:', error)
    return { success: false, error: error.message, data: null }
  }

  return { success: true, error: null, data }
}

/**
 * Get all stores with owner information
 */
export async function getAllStores() {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', data: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { success: false, error: 'Only admins can view all stores', data: null }
  }

  const { data, error } = await supabase
    .from('stores')
    .select(`
      *,
      profiles!owner_user_id (
        username
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching stores:', error)
    return { success: false, error: error.message, data: null }
  }

  return { success: true, error: null, data: data || [] }
}

/**
 * Get store details with users assigned to it
 */
export async function getStoreDetails(storeId: string) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', data: null, users: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, store_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.store_id !== storeId) {
    return { success: false, error: 'Not authorized to view this store', data: null, users: null }
  }

  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('*')
    .eq('id', storeId)
    .single()

  if (storeError) {
    return { success: false, error: storeError.message, data: null, users: null }
  }

  // Get users assigned to this store
  const { data: users, error: usersError } = await supabase
    .from('profiles')
    .select('id, username, role')
    .eq('store_id', storeId)
    .order('username')

  if (usersError) {
    return { success: false, error: usersError.message, data: store, users: [] }
  }

  return { success: true, error: null, data: store, users: users || [] }
}
