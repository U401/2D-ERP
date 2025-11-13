'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const IngredientSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  current_stock: z.number().nonnegative().default(0),
  cost: z.number().nonnegative().default(0),
  low_stock_threshold: z.number().nonnegative().default(0),
})

const RestockSchema = z.object({
  ingredient_id: z.string().uuid(),
  quantity: z.number().positive(),
  cost: z.number().nonnegative(),
})

export async function addIngredient(data: z.infer<typeof IngredientSchema>) {
  const supabase = createServerClient()
  const validated = IngredientSchema.parse(data)

  const { data: ingredient, error } = await supabase
    .from('ingredients')
    .insert(validated)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message, ingredient: null }
  }

  // Create initial batch if stock > 0
  if (validated.current_stock > 0) {
    await supabase.rpc('restock', {
      p_ingredient_id: ingredient.id,
      p_quantity: validated.current_stock,
      p_cost: validated.cost,
    })
  }

  revalidatePath('/inventory')
  return { success: true, error: null, ingredient }
}

export async function restockIngredient(data: z.infer<typeof RestockSchema>) {
  const supabase = createServerClient()
  const validated = RestockSchema.parse(data)

  const { data: batchId, error } = await supabase.rpc('restock', {
    p_ingredient_id: validated.ingredient_id,
    p_quantity: validated.quantity,
    p_cost: validated.cost,
  })

  if (error) {
    return { success: false, error: error.message, batchId: null }
  }

  revalidatePath('/inventory')
  return { success: true, error: null, batchId }
}

export async function addProduct(
  name: string,
  price: number,
  category?: string
) {
  const supabase = createServerClient()

  const { data: product, error } = await supabase
    .from('products')
    .insert({ name, price, category })
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message, product: null }
  }

  revalidatePath('/pos')
  return { success: true, error: null, product }
}

export async function updateIngredient(
  id: string,
  data: {
    name?: string
    unit?: string
    category?: string
    supplier_id?: string | null
    cost?: number
    low_stock_threshold?: number
  }
) {
  const supabase = createServerClient()

  const { data: ingredient, error } = await supabase
    .from('ingredients')
    .update(data)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message, ingredient: null }
  }

  revalidatePath('/inventory')
  return { success: true, error: null, ingredient }
}

