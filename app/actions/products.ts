'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const ProductSchema = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  category: z.string().optional().nullable(),
  image_url: z.string().url().optional().nullable(),
})

export async function addProduct(data: z.infer<typeof ProductSchema>) {
  const supabase = createServerClient()
  const validated = ProductSchema.parse(data)

  const { data: product, error } = await supabase
    .from('products')
    .insert(validated)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message, product: null }
  }

  revalidatePath('/menu')
  revalidatePath('/pos')
  return { success: true, error: null, product }
}

export async function updateProduct(
  id: string,
  data: z.infer<typeof ProductSchema>
) {
  const supabase = createServerClient()
  const validated = ProductSchema.parse(data)

  const { data: product, error } = await supabase
    .from('products')
    .update(validated)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message, product: null }
  }

  revalidatePath('/menu')
  revalidatePath('/pos')
  return { success: true, error: null, product }
}

export async function deleteProduct(id: string) {
  const supabase = createServerClient()

  const { error } = await supabase.from('products').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/menu')
  revalidatePath('/pos')
  return { success: true, error: null }
}

