import { createClient } from '@/lib/supabase/client'
import { z } from 'zod'
import type { GCashVerificationResult } from '@/lib/types/gcash'

const CustomizationSchema = z.object({
  ingredient_id: z.string().uuid().optional(),
  delta: z.number().optional(),
  name: z.string().optional(),
  price_adjustment: z.number().optional(),
}).passthrough()

const SaleItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative().optional(),
  customizations: z.array(CustomizationSchema).optional().default([]),
})

export async function finalizeSale(
  sessionId: string,
  items: Array<{ product_id: string; quantity: number; unit_price?: number; customizations?: Array<{ ingredient_id?: string; delta?: number; name?: string; price_adjustment?: number }> }>,
  paymentMethod: 'cash' | 'card' | 'gcash' = 'cash',
  gcashData?: {
    referenceCode: string
    transactionTimestamp: Date
    imageUrl: string | null
  },
  customerId?: string | null,
  clientSideId?: string | null
) {
  try {
    const supabase = createClient()

    // Get current user to determine store_id
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('Auth error in finalizeSale:', authError)
      return { success: false, error: 'User not authenticated. Please re-login.', saleId: null }
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('store_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.store_id) {
      console.error('Profile error in finalizeSale:', profileError)
      return { success: false, error: 'Store ID not found. Please contact support.', saleId: null }
    }

    // Validate items
    let validatedItems
    try {
      validatedItems = items.map((item) => SaleItemSchema.parse(item))
    } catch (zodError: any) {
      console.error('Validation error in finalizeSale:', zodError)
      return { success: false, error: 'Invalid items in cart', saleId: null }
    }

    // STRICT: Check for duplicate GCash reference code BEFORE creating the sale
    if (paymentMethod === 'gcash' && gcashData) {
      const { data: existingSales, error: duplicateCheckError } = await supabase
        .from('sales')
        .select('id, gcash_reference_code, gcash_transaction_timestamp_utc, gcash_verification_status, sold_at')
        .eq('gcash_reference_code', gcashData.referenceCode)
        .not('gcash_reference_code', 'is', null)

      if (duplicateCheckError) {
        console.error('Error checking duplicate reference code:', duplicateCheckError)
        return { success: false, error: 'Failed to verify reference code. Please try again.', saleId: null }
      }

      if (existingSales && existingSales.length > 0) {
        return {
          success: false,
          error: `Reference code ${gcashData.referenceCode.substring(0, 4)}... has already been used.`,
          saleId: null,
        }
      }
    }

    // Prepare RPC parameters
    const rpcParams: any = {
      p_session_id: sessionId,
      p_items: validatedItems,
      p_payment_method: paymentMethod,
      p_gcash_reference_code: null,
      p_gcash_transaction_timestamp_utc: null,
      p_gcash_image_url: null,
      p_customer_id: (customerId && customerId !== '') ? customerId : null,
      p_client_side_id: clientSideId || null,
    }

    if (paymentMethod === 'gcash' && gcashData) {
      const timestamp = gcashData.transactionTimestamp instanceof Date
        ? gcashData.transactionTimestamp
        : new Date(gcashData.transactionTimestamp)
      
      rpcParams.p_gcash_reference_code = gcashData.referenceCode
      rpcParams.p_gcash_transaction_timestamp_utc = timestamp.toISOString()
      rpcParams.p_gcash_image_url = gcashData.imageUrl
    }

    console.log('Calling finalize_sale RPC with:', { ...rpcParams, p_items: 'REDACTED' })
    const { data, error } = await supabase.rpc('finalize_sale', rpcParams)

    // In rare cases (network hiccups/dev mode), Postgrest can surface a non-null
    // empty-ish error object even when the RPC actually committed and returned data.
    // Treat returned sale ID as source of truth to avoid false failure overlays.
    if (error && !data) {
      console.warn('RPC Error in finalize_sale:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      })
      
      let niceError = error.message || 'Database error occurred'
      
      // Clean up PostgreSQL RAISE EXCEPTION messages (e.g. "P0001: Insufficient stock")
      if (niceError.startsWith('P0001:')) {
        niceError = niceError.replace(/^P0001:\s*/, '')
      }
      // Check if it's an HTTP error string wrapped in a JSON (rare but happens)
      if (niceError.includes('{"message":')) {
        try {
          const parsed = JSON.parse(niceError)
          if (parsed.message) niceError = parsed.message
        } catch (e) {}
      }

      return { success: false, error: niceError, saleId: null }
    }

    return { success: true, error: null, saleId: data }
  } catch (err: any) {
    console.warn('Unexpected error in finalizeSale server action:', err)
    return { success: false, error: err.message || 'An unexpected error occurred', saleId: null }
  }
}

export async function refundSale(saleId: string, reason?: string) {
  try {
    const supabase = createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'User not authenticated. Please re-login.' }
    }

    const { data, error } = await supabase.rpc('refund_sale', {
      p_sale_id: saleId,
      p_reason: reason || 'Customer refund',
    })

    if (error) {
      console.error('RPC Error in refund_sale:', error)
      let niceError = error.message || 'Failed to refund sale'
      if (niceError.startsWith('P0001:')) {
        niceError = niceError.replace(/^P0001:\s*/, '')
      }
      return { success: false, error: niceError }
    }

    return { success: true, error: null, saleId: data }
  } catch (err: any) {
    console.error('Unexpected error in refundSale action:', err)
    return { success: false, error: err.message || 'An unexpected error occurred' }
  }
}


