import { createClient } from '@/lib/supabase/client'
import { z } from 'zod'

// Helper function to get current store ID
async function getCurrentStoreId() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('store_id')
    .eq('id', user.id)
    .single()
  
  return profile?.store_id || null
}

const POItemSchema = z.object({
  ingredient_id: z.string().uuid(),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
})

export async function createPurchaseOrder(
  items: Array<{ ingredient_id: string; quantity: number; unit_price: number }>,
  supplierId: string,
  notes?: string,
  deliveryDate?: string
) {
  const storeId = await getCurrentStoreId()
  if (!storeId) {
    return { success: false, error: 'No store assigned to this user', purchaseOrder: null }
  }
  const supabase = createClient()

  try {
    // Validate items
    const validatedItems = items.map((item) => POItemSchema.parse(item))

    // Calculate total
    const totalAmount = validatedItems.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0
    )

    // Generate PO number
    const { data: poNumberData } = await supabase.rpc('generate_po_number', { p_store_id: storeId })
    const poNumber = poNumberData as string

    // Create PO
    const { data: poData, error: poError } = await supabase
      .from('purchase_orders')
      .insert({
        store_id: storeId,
        supplier_id: supplierId,
        po_number: poNumber,
        status: 'pending',
        total_amount: totalAmount,
        notes: notes || null,
        delivery_date: deliveryDate || null,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      })
      .select()
      .single()

    if (poError) {
      return { success: false, error: poError.message, purchaseOrder: null }
    }

    // Create PO items
    const poItems = validatedItems.map((item) => ({
      purchase_order_id: poData.id,
      ingredient_id: item.ingredient_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
    }))

    const { error: itemsError } = await supabase
      .from('purchase_order_items')
      .insert(poItems)
      .select()

    if (itemsError) {
      return { success: false, error: itemsError.message, purchaseOrder: null }
    }

    return { success: true, error: null, purchaseOrder: poData }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.errors[0].message, purchaseOrder: null }
    }
    return { success: false, error: 'Failed to create purchase order', purchaseOrder: null }
  }
}

export async function listPurchaseOrders(storeId?: string, status?: string) {
  const supabase = createClient()

  let query = supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers!inner (name),
      items:purchase_order_items (
        *,
        ingredient:ingredients!inner (name, unit)
      )
    `)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  // If not admin, filter by store_id
  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data, error } = await query

  if (error) {
    return { success: false, error: error.message, purchaseOrders: [] }
  }

  return { success: true, error: null, purchaseOrders: data || [] }
}

export async function getPurchaseOrderDetails(purchaseOrderId: string) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers!inner (name, contact_person, email, address),
      items:purchase_order_items (
        *,
        ingredient:ingredients!inner (name, unit)
      )
    `)
    .eq('id', purchaseOrderId)
    .single()

  if (error) {
    return { success: false, error: error.message, purchaseOrder: null }
  }

  return { success: true, error: null, purchaseOrder: data }
}

export async function updatePOStatus(purchaseOrderId: string, status: 'pending' | 'received' | 'cancelled') {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('purchase_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', purchaseOrderId)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message, purchaseOrder: null }
  }

  return { success: true, error: null, purchaseOrder: data }
}

export async function receiveDelivery(
  purchaseOrderId: string,
  receivedItems: Array<{ purchase_order_item_id: string; received_quantity: number }>
) {
  const supabase = createClient()

  try {
    // Get PO details to get store_id
    const { data: poData } = await supabase
      .from('purchase_orders')
      .select('store_id')
      .eq('id', purchaseOrderId)
      .single()

    if (!poData) {
      return { success: false, error: 'Purchase order not found', purchaseOrder: null }
    }

    // Update received quantities for each item
    for (const item of receivedItems) {
      const { error: updateError } = await supabase
        .from('purchase_order_items')
        .update({ received_quantity: item.received_quantity })
        .eq('id', item.purchase_order_item_id)

      if (updateError) {
        console.error('Error updating item:', updateError)
      }
    }

    // Update PO status to received
    const { data, error } = await supabase
      .from('purchase_orders')
      .update({
        status: 'received',
        updated_at: new Date().toISOString(),
      })
      .eq('id', purchaseOrderId)
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message, purchaseOrder: null }
    }

    return { success: true, error: null, purchaseOrder: data }
  } catch (err) {
    return { success: false, error: 'Failed to process delivery', purchaseOrder: null }
  }
}

export async function cancelPurchaseOrder(purchaseOrderId: string) {
  return updatePOStatus(purchaseOrderId, 'cancelled')
}
