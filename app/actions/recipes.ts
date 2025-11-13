'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getProductRecipes(productId: string) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('recipes')
    .select('*, ingredients(name, unit)')
    .eq('product_id', productId)

  if (error) {
    return { success: false, error: error.message, recipes: [] }
  }

  return { success: true, error: null, recipes: data || [] }
}

export async function upsertRecipe(
  productId: string,
  ingredientId: string,
  quantity: number
) {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('recipes')
    .upsert(
      {
        product_id: productId,
        ingredient_id: ingredientId,
        quantity,
      },
      {
        onConflict: 'product_id,ingredient_id',
      }
    )
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message, recipe: null }
  }

  revalidatePath('/menu')
  revalidatePath('/pos')
  revalidatePath('/inventory')
  return { success: true, error: null, recipe: data }
}

export async function deleteRecipe(recipeId: string) {
  const supabase = createServerClient()

  const { error } = await supabase.from('recipes').delete().eq('id', recipeId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/menu')
  revalidatePath('/pos')
  revalidatePath('/inventory')
  return { success: true, error: null }
}

export async function syncProductRecipes(
  productId: string,
  recipes: Array<{ ingredient_id: string; quantity: number }>
) {
  const supabase = createServerClient()

  // Delete all existing recipes for this product
  await supabase.from('recipes').delete().eq('product_id', productId)

  // Insert new recipes
  if (recipes.length > 0) {
    const { error } = await supabase.from('recipes').insert(
      recipes.map((r) => ({
        product_id: productId,
        ingredient_id: r.ingredient_id,
        quantity: r.quantity,
      }))
    )

    if (error) {
      return { success: false, error: error.message }
    }
  }

  revalidatePath('/menu')
  revalidatePath('/pos')
  revalidatePath('/inventory')
  return { success: true, error: null }
}


