/**
 * Admin Actions - Tauri Backend Integration
 * 
 * This module provides admin user management operations through Tauri commands.
 * These run in the desktop app's Rust backend using Supabase service role key.
 * 
 * Security: All operations are authenticated and logged to activity_logs table.
 */

import { invoke } from '@tauri-apps/api/core'

export type UserRole = 'admin' | 'staff'

export interface User {
  id: string
  username: string
  role: string
  store_id?: string | null
  created_at?: string
}

export interface AdminActionResult {
  success: boolean
  message: string
  user?: User
  error?: string
}

/**
 * Create a new user with authentication, profile, and store
 * @param username - 3-50 chars, alphanumeric/hyphens/underscores only
 * @param password - Minimum 6 characters
 * @param role - 'admin' or 'staff'
 */
export async function createUser(
  username: string,
  password: string,
  role: UserRole = 'staff'
): Promise<AdminActionResult> {
  try {
    const result = await invoke<string>('create_user', {
      username: username.trim(),
      password,
      role,
    })
    return JSON.parse(result)
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Update a user's username
 * @param userId - User ID to update
 * @param newUsername - 3-50 chars, alphanumeric/hyphens/underscores only
 */
export async function updateUsername(
  userId: string,
  newUsername: string
): Promise<AdminActionResult> {
  try {
    const result = await invoke<string>('update_username', {
      userId,
      newUsername: newUsername.trim(),
    })
    return JSON.parse(result)
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Delete a user and their associated data
 * - Cannot delete own account
 * - Cannot delete last admin
 * - Cascades: store → products/ingredients/sales
 */
export async function deleteUser(userId: string): Promise<AdminActionResult> {
  try {
    const result = await invoke<string>('delete_user', { userId })
    return JSON.parse(result)
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Reset a user's password
 * @param userId - User ID to reset password for
 * @param newPassword - Minimum 6 characters
 */
export async function resetPassword(
  userId: string,
  newPassword: string
): Promise<AdminActionResult> {
  try {
    const result = await invoke<string>('reset_password', {
      userId,
      newPassword,
    })
    return JSON.parse(result)
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Update a user's role
 * - Cannot change own role
 * - Cannot demote last admin
 * @param userId - User ID to update
 * @param newRole - 'admin' or 'staff'
 */
export async function updateRole(
  userId: string,
  newRole: UserRole
): Promise<AdminActionResult> {
  try {
    const result = await invoke<string>('update_role', {
      userId,
      newRole,
    })
    return JSON.parse(result)
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * List all users with their profiles and stores
 * Used by admin dashboard for user management
 */
export async function listUsers(): Promise<{ success: boolean; users: User[]; error?: string }> {
  try {
    const result = await invoke<string>('list_users')
    return JSON.parse(result)
  } catch (error) {
    return {
      success: false,
      users: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export interface Store {
  id: string
  name: string
  owner_user_id: string
  created_at: string
}

export interface StoreListResult {
  success: boolean
  stores: Store[]
  error?: string
}

/**
 * List all stores
 */
export async function listStores(): Promise<StoreListResult> {
  try {
    const result = await invoke<string>('list_stores')
    return JSON.parse(result)
  } catch (error) {
    return {
      success: false,
      stores: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Create a new store
 */
export async function createStore(
  storeName: string,
  ownerId?: string
): Promise<{ success: boolean; message: string; store_id?: string; error?: string }> {
  try {
    const result = await invoke<string>('create_store', {
      storeName: storeName.trim(),
      ownerId,
    })
    return JSON.parse(result)
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Delete a store
 */
export async function deleteStore(
  storeId: string
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const result = await invoke<string>('delete_store', { storeId })
    return JSON.parse(result)
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Assign a user to a store
 */
export async function assignUserToStore(
  userId: string,
  storeId: string
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const result = await invoke<string>('assign_user_to_store', {
      userId,
      storeId,
    })
    return JSON.parse(result)
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Unassign a user from their store
 */
export async function unassignUserFromStore(
  userId: string
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const result = await invoke<string>('unassign_user_from_store', { userId })
    return JSON.parse(result)
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

