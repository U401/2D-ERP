'use client'

import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'
import { getInstanceId } from '@/lib/utils/instance-id'

// Use a global variable to ensure singleton across hot reloads
declare global {
  var __supabaseClient: SupabaseClient | undefined
}

let supabaseClient: SupabaseClient | null = null

function getPerWindowStorageKey() {
  if (typeof window === 'undefined') return 'coffee-shop-erp-auth:server'

  // Use a static key if running in Tauri (Android/PC app) so the session persists across app restarts.
  // @ts-ignore
  if (window.__TAURI_INTERNALS__ || window.__TAURI__) {
    return 'coffee-shop-erp-auth-token'
  }

  // Keep the per-window key for normal web browsers so multiple tabs don't share auth state.
  return `coffee-shop-erp-auth:${getInstanceId()}`
}

export function createClient() {
  // Check global first (survives hot reloads)
  if (typeof window !== 'undefined' && globalThis.__supabaseClient) {
    return globalThis.__supabaseClient
  }
  
  // Return cached client if it exists
  if (supabaseClient) {
    return supabaseClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'
    )
  }

  // Create and cache the client instance
  // Use a per-window storage key so multiple instances don't share auth state.
  supabaseClient = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: getPerWindowStorageKey(),
    },
  })

  // Store in global for hot reload persistence
  if (typeof window !== 'undefined') {
    globalThis.__supabaseClient = supabaseClient
  }

  return supabaseClient
}

