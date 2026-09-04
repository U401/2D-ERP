import { createClient } from '@/lib/supabase/client'

export async function getProductRecipes(productId: string, store_id?: string) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', recipes: [] }

  let storeId = store_id
  if (!storeId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('store_id, role')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'admin') {
      const { data, error } = await supabase
        .from('recipes')
        .select('*, ingredients(name, unit)')
        .eq('product_id', productId)

      if (error) return { success: false, error: error.message, recipes: [] }
      return { success: true, error: null, recipes: data || [] }
    }

    if (!profile?.store_id) {
      return { success: false, error: 'User has no store assigned', recipes: [] }
    }
    storeId = profile.store_id
  }

  const { data, error } = await supabase
    .from('recipes')
    .select('*, ingredients(name, unit)')
    .eq('product_id', productId)
    .eq('store_id', storeId)

  if (error) {
    return { success: false, error: error.message, recipes: [] }
  }

  return { success: true, error: null, recipes: data || [] }
}

export async function upsertRecipe(
  productId: string,
  ingredientId: string,
  quantity: number,
  store_id?: string
) {
  const supabase = createClient()

  let storeId = store_id
  if (!storeId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated', recipe: null }

    const { data: profile } = await supabase
      .from('profiles')
      .select('store_id')
      .eq('id', user.id)
      .single()
    
    if (!profile?.store_id) {
      return { success: false, error: 'User has no store assigned', recipe: null }
    }
    storeId = profile.store_id
  }

  const { data, error } = await supabase
    .from('recipes')
    .upsert(
      {
        product_id: productId,
        ingredient_id: ingredientId,
        quantity,
        store_id: storeId,
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

  return { success: true, error: null, recipe: data }
}

export async function deleteRecipe(recipeId: string) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('store_id')
    .eq('id', user.id)
    .single()

  if (!profile?.store_id) {
    return { success: false, error: 'User has no store assigned' }
  }

  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', recipeId)
    .eq('store_id', profile.store_id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

export async function syncProductRecipes(
  productId: string,
  recipes: Array<{ ingredient_id: string; quantity: number }>,
  store_id?: string
) {
  const supabase = createClient()

  let storeId = store_id
  if (!storeId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('store_id, role')
      .eq('id', user.id)
      .single()
    
    if (profile?.store_id) {
      storeId = profile.store_id
    } else {
      const { data: product } = await supabase
        .from('products')
        .select('store_id')
        .eq('id', productId)
        .single()
      storeId = product?.store_id
    }
  }

  if (!storeId) {
    return { success: false, error: 'Could not determine store_id for recipe' }
  }

  // Delete all existing recipes for this product, scoped to store
  await supabase
    .from('recipes')
    .delete()
    .eq('product_id', productId)
    .eq('store_id', storeId)

  // Insert new recipes
  if (recipes.length > 0) {
    const { error } = await supabase.from('recipes').insert(
      recipes.map((r) => ({
        product_id: productId,
        ingredient_id: r.ingredient_id,
        quantity: r.quantity,
        store_id: storeId,
      }))
    )

    if (error) {
      return { success: false, error: error.message }
    }
  }

  return { success: true, error: null }
}









