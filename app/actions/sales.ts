'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const SaleItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative().optional(),
})

export async function finalizeSale(
  sessionId: string,
  items: Array<{ product_id: string; quantity: number; unit_price?: number }>,
  paymentMethod: 'cash' | 'card' = 'cash'
) {
  const supabase = createServerClient()

  // Validate items
  const validatedItems = items.map((item) => SaleItemSchema.parse(item))

  const { data, error } = await supabase.rpc('finalize_sale', {
    p_session_id: sessionId,
    p_items: validatedItems,
    p_payment_method: paymentMethod,
  })

  if (error) {
    return { success: false, error: error.message, saleId: null }
  }

  revalidatePath('/pos')
  revalidatePath('/reports')
  revalidatePath('/inventory')
  
  return { success: true, error: null, saleId: data }
}

