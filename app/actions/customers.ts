import { createClient } from '@/lib/supabase/client'
import { z } from 'zod'

const CustomerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  email: z.string().email('Invalid email address').nullable().optional().or(z.literal('')),
  address: z.string().nullable().optional(),
})

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

export async function createCustomer(
  name: string,
  phone: string,
  email?: string | null,
  address?: string | null
) {
  const storeId = await getCurrentStoreId()
  if (!storeId) {
    return { success: false, error: 'No store assigned to this user', customer: null }
  }

  const supabase = createClient()

  try {
    const validatedData = CustomerSchema.parse({ name, phone, email, address })

    const { data, error } = await supabase
      .from('customers')
      .insert({
        store_id: storeId,
        name: validatedData.name,
        phone: validatedData.phone,
        email: validatedData.email,
        address: validatedData.address,
      })
      .select()
      .single()

    if (error) {
      // Handle duplicate phone number error
      if (error.code === '23505') {
        return { success: false, error: 'A customer with this phone number already exists', customer: null }
      }
      return { success: false, error: error.message, customer: null }
    }

    return { success: true, error: null, customer: data }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.errors[0].message, customer: null }
    }
    return { success: false, error: 'Failed to create customer', customer: null }
  }
}

export async function getCustomerByPhone(phone: string) {
  const supabase = createClient()
  const storeId = await getCurrentStoreId()

  // If not admin, only search within their store
  const { data: { user } } = await supabase.auth.getUser()
  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    
    isAdmin = profile?.role === 'admin'
  }

  let query = supabase
    .from('customers')
    .select('*')
    .eq('phone', phone)

  if (!isAdmin && storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data, error } = await query
    .limit(1)
    .maybeSingle()

  if (error) {
    return { success: false, error: error.message, customer: null }
  }

  return { success: true, error: null, customer: data }
}

export async function getCustomerById(customerId: string) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', customer: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('store_id')
    .eq('id', user.id)
    .single()

  if (!profile?.store_id) {
    return { success: false, error: 'User has no store assigned', customer: null }
  }

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('store_id', profile.store_id)
    .single()

  if (error) {
    return { success: false, error: error.message, customer: null }
  }

  return { success: true, error: null, customer: data }
}

export async function getCustomers(searchTerm?: string) {
  const supabase = createClient()
  const storeId = await getCurrentStoreId()

  // If not admin, filter by store_id
  const { data: { user } } = await supabase.auth.getUser()
  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    
    isAdmin = profile?.role === 'admin'
  }

  let query = supabase.from('customers').select('*')

  if (searchTerm) {
    query = query.or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
  }

  if (!isAdmin && storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    return { success: false, error: error.message, customers: [] }
  }

  return { success: true, error: null, customers: data || [] }
}

export async function updateCustomer(
  customerId: string,
  updates: {
    name?: string
    phone?: string
    email?: string | null
    address?: string | null
  }
) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', customer: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('store_id')
    .eq('id', user.id)
    .single()

  if (!profile?.store_id) {
    return { success: false, error: 'User has no store assigned', customer: null }
  }

  const { data, error } = await supabase
    .from('customers')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', customerId)
    .eq('store_id', profile.store_id)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message, customer: null }
  }

  return { success: true, error: null, customer: data }
}

export async function getCustomerHistory(customerId: string, limit: number = 20) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', sales: [] }

  const { data: profile } = await supabase
    .from('profiles')
    .select('store_id')
    .eq('id', user.id)
    .single()

  if (!profile?.store_id) {
    return { success: false, error: 'User has no store assigned', sales: [] }
  }

  const { data, error } = await supabase
    .from('sales')
    .select(`
      id,
      total_amount,
      sold_at,
      payment_method,
      sessions!inner (
        user_id
      )
    `)
    .eq('customer_id', customerId)
    .eq('store_id', profile.store_id)
    .order('sold_at', { ascending: false })
    .limit(limit)

  if (error) {
    return { success: false, error: error.message, sales: [] }
  }

  return { success: true, error: null, sales: data || [] }
}
