import { createClient } from '@/lib/supabase/client'
import { z } from 'zod'

const SupplierSchema = z.object({
  name: z.string().min(1),
  contact_person: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  store_id: z.string().uuid().optional().nullable(),
})

export async function addSupplier(data: z.infer<typeof SupplierSchema>) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', supplier: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, store_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && !profile?.store_id) {
    return { success: false, error: 'User has no store assigned', supplier: null }
  }

  const validated = SupplierSchema.parse(data)
  const targetStoreId = profile?.role === 'admin' ? validated.store_id : profile?.store_id

  if (!targetStoreId) {
    return { success: false, error: 'Please specify a store for this supplier', supplier: null }
  }

  const { data: supplier, error } = await supabase
    .from('suppliers')
    .insert({ ...validated, store_id: targetStoreId })
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message, supplier: null }
  }

  return { success: true, error: null, supplier }
}

export async function getSuppliers() {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', suppliers: [] }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, store_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && !profile?.store_id) {
    return { success: false, error: 'User has no store assigned', suppliers: [] }
  }

  let query = supabase.from('suppliers').select('*').order('name')
  
  if (profile?.role !== 'admin' && profile?.store_id) {
    query = query.eq('store_id', profile.store_id)
  }

  const { data, error } = await query

  if (error) {
    return { success: false, error: error.message, suppliers: [] }
  }

  return { success: true, error: null, suppliers: data || [] }
}

export async function updateSupplier(
  id: string,
  data: z.infer<typeof SupplierSchema>
) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', supplier: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, store_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && !profile?.store_id) {
    return { success: false, error: 'User has no store assigned', supplier: null }
  }

  const validated = SupplierSchema.parse(data)
  
  let query = supabase.from('suppliers').update(validated).eq('id', id)
  
  if (profile?.role !== 'admin' && profile?.store_id) {
    query = query.eq('store_id', profile.store_id)
  }

  const { data: supplier, error } = await query.select().single()

  if (error) {
    return { success: false, error: error.message, supplier: null }
  }

  return { success: true, error: null, supplier }
}

export async function deleteSupplier(id: string) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, store_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && !profile?.store_id) {
    return { success: false, error: 'User has no store assigned' }
  }

  let query = supabase.from('suppliers').delete().eq('id', id)
  
  if (profile?.role !== 'admin' && profile?.store_id) {
    query = query.eq('store_id', profile.store_id)
  }

  const { error } = await query

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}
