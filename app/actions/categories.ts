'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getAllCategories() {
  const supabase = createServerClient()
  const { data: products } = await supabase.from('products').select('category')

  const categories = Array.from(
    new Set(products?.map((p) => p.category).filter(Boolean))
  ) as string[]

  return { success: true, categories: categories.sort() }
}

export async function renameCategory(oldName: string, newName: string) {
  const supabase = createServerClient()

  // Check if new name already exists
  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('category', newName)
    .limit(1)

  if (existing && existing.length > 0) {
    return {
      success: false,
      error: `Category "${newName}" already exists. Please choose a different name.`,
    }
  }

  // Update all products with the old category name
  const { error } = await supabase
    .from('products')
    .update({ category: newName })
    .eq('category', oldName)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/menu')
  revalidatePath('/pos')
  return { success: true, error: null }
}

export async function deleteCategory(categoryName: string) {
  const supabase = createServerClient()

  // Check if any products use this category
  const { data: products } = await supabase
    .from('products')
    .select('id')
    .eq('category', categoryName)
    .limit(1)

  if (products && products.length > 0) {
    return {
      success: false,
      error: `Cannot delete category "${categoryName}" because ${products.length} product(s) are using it. Please reassign products to another category first.`,
    }
  }

  // Since categories are just strings in products, there's nothing to delete
  // This function is mainly for validation
  revalidatePath('/menu')
  revalidatePath('/pos')
  return { success: true, error: null }
}


