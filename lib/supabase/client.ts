'use client'

import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

// Use a global variable to ensure singleton across hot reloads
declare global {
  var __supabaseClient: SupabaseClient | undefined
}

let supabaseClient: SupabaseClient | null = null

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
  // Use a unique storage key to avoid conflicts
  supabaseClient = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'coffee-shop-erp-auth',
    },
  })

  // Store in global for hot reload persistence
  if (typeof window !== 'undefined') {
    globalThis.__supabaseClient = supabaseClient
  }

  return supabaseClient
}

