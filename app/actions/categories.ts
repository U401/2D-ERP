import { createClient } from '@/lib/supabase/client'

export async function getAllCategories(storeId?: string) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, categories: [] }

  let targetStoreId = storeId
  
  if (!targetStoreId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('store_id, role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin' && !profile?.store_id) return { success: false, categories: [] }
    targetStoreId = profile?.store_id || ''
  }

  if (!targetStoreId) return { success: false, categories: [] }

  const { data: products } = await supabase
    .from('products')
    .select('category')
    .eq('store_id', targetStoreId)

  const categories = Array.from(
    new Set(products?.map((p) => p.category).filter(Boolean))
  ) as string[]

  return { success: true, categories: categories.sort() }
}

export async function renameCategory(oldName: string, newName: string, storeId?: string) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  let targetStoreId = storeId
  
  if (!targetStoreId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('store_id, role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin' && !profile?.store_id) return { success: false, error: 'User has no store assigned' }
    targetStoreId = profile?.store_id || ''
  }

  if (!targetStoreId) return { success: false, error: 'User has no store assigned' }

  // Check if new name already exists in this store
  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('category', newName)
    .eq('store_id', targetStoreId)
    .limit(1)

  if (existing && existing.length > 0) {
    return {
      success: false,
      error: `Category "${newName}" already exists. Please choose a different name.`,
    }
  }

  // Update all products with the old category name in this store
  const { error } = await supabase
    .from('products')
    .update({ category: newName })
    .eq('category', oldName)
    .eq('store_id', targetStoreId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

export async function deleteCategory(categoryName: string, storeId?: string) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  let targetStoreId = storeId
  
  if (!targetStoreId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('store_id, role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin' && !profile?.store_id) return { success: false, error: 'User has no store assigned' }
    targetStoreId = profile?.store_id || ''
  }

  if (!targetStoreId) return { success: false, error: 'User has no store assigned' }

  // Check if any products use this category in this store
  const { data: products } = await supabase
    .from('products')
    .select('id')
    .eq('category', categoryName)
    .eq('store_id', targetStoreId)
    .limit(1)

  if (products && products.length > 0) {
    return {
      success: false,
      error: `Cannot delete category "${categoryName}" because ${products.length} product(s) are using it. Please reassign products to another category first.`,
    }
  }

  // Since categories are just strings in products, there's nothing to delete
  // This function is mainly for validation
  return { success: true, error: null }
}







