'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const SupplierSchema = z.object({
  name: z.string().min(1),
  contact_person: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
})

export async function addSupplier(data: z.infer<typeof SupplierSchema>) {
  const supabase = createServerClient()
  const validated = SupplierSchema.parse(data)

  const { data: supplier, error } = await supabase
    .from('suppliers')
    .insert(validated)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message, supplier: null }
  }

  revalidatePath('/inventory')
  return { success: true, error: null, supplier }
}

export async function getSuppliers() {
  const supabase = createServerClient()
  const { data, error } = await supabase.from('suppliers').select('*').order('name')

  if (error) {
    return { success: false, error: error.message, suppliers: [] }
  }

  return { success: true, error: null, suppliers: data || [] }
}

export async function updateSupplier(
  id: string,
  data: z.infer<typeof SupplierSchema>
) {
  const supabase = createServerClient()
  const validated = SupplierSchema.parse(data)

  const { data: supplier, error } = await supabase
    .from('suppliers')
    .update(validated)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message, supplier: null }
  }

  revalidatePath('/inventory')
  return { success: true, error: null, supplier }
}

export async function deleteSupplier(id: string) {
  const supabase = createServerClient()

  const { error } = await supabase.from('suppliers').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/inventory')
  return { success: true, error: null }
}


