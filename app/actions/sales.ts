'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { GCashVerificationResult } from '@/lib/types/gcash'

const SaleItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative().optional(),
})

export async function finalizeSale(
  sessionId: string,
  items: Array<{ product_id: string; quantity: number; unit_price?: number }>,
  paymentMethod: 'cash' | 'card' | 'gcash' = 'cash',
  gcashData?: {
    referenceCode: string
    transactionTimestamp: Date
    imageUrl: string | null
  }
) {
  const supabase = createServerClient()

  // Validate items
  const validatedItems = items.map((item) => SaleItemSchema.parse(item))

  // STRICT: Check for duplicate GCash reference code BEFORE creating the sale
  // Reject ANY duplicate immediately, regardless of timestamp, status, or any other condition
  if (paymentMethod === 'gcash' && gcashData) {
    const { data: existingSales, error: duplicateCheckError } = await supabase
      .from('sales')
      .select('id, gcash_reference_code, gcash_transaction_timestamp_utc, gcash_verification_status, sold_at')
      .eq('gcash_reference_code', gcashData.referenceCode)
      .not('gcash_reference_code', 'is', null) // Only check sales that have a reference code

    if (duplicateCheckError) {
      console.error('Error checking duplicate reference code:', duplicateCheckError)
      return { success: false, error: 'Failed to verify reference code. Please try again.', saleId: null }
    }

    // STRICT: Reject ANY duplicate reference code immediately
    if (existingSales && existingSales.length > 0) {
      const duplicateSale = existingSales[0]
      
      // Log for debugging
      // Ensure transactionTimestamp is a Date object for logging
      const timestamp = gcashData.transactionTimestamp instanceof Date
        ? gcashData.transactionTimestamp
        : new Date(gcashData.transactionTimestamp)
      
      console.log('STRICT DUPLICATE REJECTION in finalizeSale - Reference code already exists:', {
        referenceCode: gcashData.referenceCode,
        existingSaleId: duplicateSale.id,
        existingStatus: duplicateSale.gcash_verification_status,
        existingTimestamp: duplicateSale.gcash_transaction_timestamp_utc,
        existingSoldAt: duplicateSale.sold_at,
        newTimestamp: timestamp.toISOString(),
      })

      return {
        success: false,
        error: `Reference code ${gcashData.referenceCode.substring(0, 4)}...${gcashData.referenceCode.substring(gcashData.referenceCode.length - 2)} has already been used. Each GCash transaction can only be used once.`,
        saleId: null,
      }
    }
  }

  // Prepare RPC parameters
  const rpcParams: any = {
    p_session_id: sessionId,
    p_items: validatedItems,
    p_payment_method: paymentMethod,
  }

  // Add GCash-specific parameters if payment method is GCash
  if (paymentMethod === 'gcash' && gcashData) {
    // Ensure transactionTimestamp is a Date object (handle string serialization)
    const timestamp = gcashData.transactionTimestamp instanceof Date
      ? gcashData.transactionTimestamp
      : new Date(gcashData.transactionTimestamp)
    
    rpcParams.p_gcash_reference_code = gcashData.referenceCode
    rpcParams.p_gcash_transaction_timestamp_utc = timestamp.toISOString()
    rpcParams.p_gcash_image_url = gcashData.imageUrl
  }

  const { data, error } = await supabase.rpc('finalize_sale', rpcParams)

  if (error) {
    return { success: false, error: error.message, saleId: null }
  }

  revalidatePath('/pos')
  revalidatePath('/reports')
  revalidatePath('/inventory')
  
  return { success: true, error: null, saleId: data }
}

