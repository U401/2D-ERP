import { createClient } from '@/lib/supabase/client'
import { z } from 'zod'

const IngredientSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  category: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : val),
    z.string().nullable().optional()
  ),
  current_stock: z.number().nonnegative().default(0),
  low_stock_threshold: z.number().nonnegative().default(0),
  supplier_id: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : val),
    z.string().uuid().nullable().optional()
  ),
  store_id: z.string().uuid().optional(),
  purchase_price: z.number().nullable().optional(),
  purchase_yield: z.number().nullable().optional(),
  purchase_unit: z.string().nullable().optional(),
})

const RestockSchema = z.object({
  ingredient_id: z.string().uuid(),
  quantity: z.number().positive(),
  total_cost: z.number().nonnegative(),
})

export async function addIngredient(data: z.infer<typeof IngredientSchema>) {
  const supabase = createClient()
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
  if (validated.current_stock > 0 && validated.purchase_price != null) {
    const { error: batchError } = await supabase.rpc('restock', {
      p_ingredient_id: ingredient.id,
      p_quantity: validated.current_stock,
      p_cost: validated.purchase_price,
    })
    if (batchError) {
      // Ingredient row was created but initial batch failed.
      // Return a warning so the UI can surface it — stock can be added manually via restock.
      console.error('Initial batch creation failed for ingredient:', ingredient.id, batchError)
      return {
        success: true,
        error: `Ingredient saved, but initial stock batch failed: ${batchError.message}. Please restock manually.`,
        ingredient,
      }
    }
  }

  return { success: true, error: null, ingredient }
}

export async function restockIngredient(data: z.infer<typeof RestockSchema>) {
  const supabase = createClient()
  const validated = RestockSchema.parse(data)

  const { data: batchId, error } = await supabase.rpc('restock', {
    p_ingredient_id: validated.ingredient_id,
    p_quantity: validated.quantity,
    p_cost: validated.total_cost,
  })

  if (error) {
    return { success: false, error: error.message, batchId: null }
  }

  
  return { success: true, error: null, batchId }
}

export async function addProduct(
  name: string,
  price: number,
  category?: string
) {
  const supabase = createClient()

  const { data: product, error } = await supabase
    .from('products')
    .insert({ name, price, category })
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message, product: null }
  }

  
  return { success: true, error: null, product }
}

export async function updateIngredient(
  id: string,
  data: {
    name?: string
    unit?: string
    category?: string
    supplier_id?: string | null
    low_stock_threshold?: number
    purchase_price?: number | null
    purchase_yield?: number | null
    purchase_unit?: string | null
  }
) {
  const supabase = createClient()

  const { data: ingredient, error } = await supabase
    .from('ingredients')
    .update(data)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message, ingredient: null }
  }

  
  return { success: true, error: null, ingredient }
}

export async function deleteIngredient(id: string) {
  const supabase = createClient()

  const { error } = await supabase.from('ingredients').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  
  
  return { success: true, error: null }
}

export async function getCategories() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, categories: [] }

  const { data: profile } = await supabase.from('profiles').select('role, store_id').eq('id', user.id).single()
  
  const query = supabase.from('ingredients').select('category')
  if (profile?.role !== 'admin' && profile?.store_id) {
    query.eq('store_id', profile.store_id)
  }

  const { data, error } = await query.not('category', 'is', null)
  if (error) return { success: false, categories: [] }

  const uniqueCategories = Array.from(new Set(data.map(d => d.category as string))).sort()
  return { success: true, categories: uniqueCategories }
}

export async function renameCategory(oldName: string, newName: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: profile } = await supabase.from('profiles').select('role, store_id').eq('id', user.id).single()

  const query = supabase.from('ingredients').update({ category: newName }).eq('category', oldName)
  if (profile?.role !== 'admin' && profile?.store_id) {
    query.eq('store_id', profile.store_id)
  }

  const { error } = await query
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function adjustIngredientStock(id: string, newTotal: number) {
  const supabase = createClient()

  const { error } = await supabase.rpc('set_ingredient_stock', {
    p_ingredient_id: id,
    p_new_total: newTotal,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  
  return { success: true, error: null }
}

export async function removeIngredientStock(id: string, quantity: number) {
  const supabase = createClient()

  const { data: ingredient, error: fetchError } = await supabase
    .from('ingredients')
    .select('current_stock')
    .eq('id', id)
    .single()

  if (fetchError || !ingredient) {
    return { success: false, error: 'Ingredient not found' }
  }

  const newTotal = Math.max(0, ingredient.current_stock - quantity)
  
  const { error } = await supabase.rpc('set_ingredient_stock', {
    p_ingredient_id: id,
    p_new_total: newTotal,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  
  return { success: true, error: null }
}
