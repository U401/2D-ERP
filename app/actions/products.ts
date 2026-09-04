import { createClient } from '@/lib/supabase/client'
import { z } from 'zod'

const ProductSchema = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  category: z.string().optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  store_id: z.string().uuid().optional(),
})

export async function addProduct(data: z.infer<typeof ProductSchema>) {
  const supabase = createClient()
  
  // Get current user to determine store_id if not provided
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', product: null }

  let storeId = data.store_id
  if (!storeId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('store_id')
      .eq('id', user.id)
      .single()
    
    if (!profile?.store_id) {
      return { success: false, error: 'User has no store assigned', product: null }
    }
    storeId = profile.store_id
  }

  const validated = ProductSchema.parse({ ...data, store_id: storeId })

  const { data: product, error } = await supabase
    .from('products')
    .insert(validated)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message, product: null }
  }

  return { success: true, error: null, product }
}

export async function updateProduct(
  id: string,
  data: z.infer<typeof ProductSchema>
) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', product: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('store_id')
    .eq('id', user.id)
    .single()

  if (!profile?.store_id) {
    return { success: false, error: 'User has no store assigned', product: null }
  }

  const validated = ProductSchema.parse({ ...data, store_id: profile.store_id })

  const { data: product, error } = await supabase
    .from('products')
    .update(validated)
    .eq('id', id)
    .eq('store_id', profile.store_id)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message, product: null }
  }

  return { success: true, error: null, product }
}

export async function deleteProduct(id: string) {
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

  // Fetch the product first to get its image_url for cleanup
  const { data: product } = await supabase
    .from('products')
    .select('image_url')
    .eq('id', id)
    .eq('store_id', profile.store_id)
    .single()

  // Delete the product record (recipes cascade automatically)
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)
    .eq('store_id', profile.store_id)

  if (error) {
    return { success: false, error: error.message }
  }

  // Clean up the product image from storage if it exists
  if (product?.image_url) {
    try {
      // Extract the storage path from the public URL
      // URLs look like: https://<project>.supabase.co/storage/v1/object/public/product-images/products/<filename>
      const url = new URL(product.image_url)
      const pathParts = url.pathname.split('/product-images/')
      if (pathParts.length === 2) {
        await supabase.storage.from('product-images').remove([pathParts[1]])
      }
    } catch {
      // Storage cleanup failure is non-critical — product is already deleted
    }
  }

  return { success: true, error: null }
}


// ── Admin-scoped actions ──────────────────────────────────────────────────────
// These allow an admin to manage products across any store, not just their own.

async function assertAdmin(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return { error: 'Not authorized' }
  return { error: null }
}

export async function addProductForStore(
  storeId: string,
  data: { name: string; price: number; category?: string | null; image_url?: string | null; low_stock_threshold?: number }
) {
  const supabase = createClient()
  const { error: authError } = await assertAdmin(supabase)
  if (authError) return { success: false, error: authError, product: null }

  const { data: product, error } = await supabase
    .from('products')
    .insert({ ...data, store_id: storeId })
    .select()
    .single()

  if (error) return { success: false, error: error.message, product: null }
  return { success: true, error: null, product }
}

export async function updateProductForStore(
  productId: string,
  storeId: string,
  data: { name?: string; price?: number; category?: string | null; image_url?: string | null; low_stock_threshold?: number }
) {
  const supabase = createClient()
  const { error: authError } = await assertAdmin(supabase)
  if (authError) return { success: false, error: authError, product: null }

  const { data: product, error } = await supabase
    .from('products')
    .update(data)
    .eq('id', productId)
    .eq('store_id', storeId)
    .select()
    .single()

  if (error) return { success: false, error: error.message, product: null }
  return { success: true, error: null, product }
}

export async function deleteProductForStore(productId: string, storeId: string) {
  const supabase = createClient()
  const { error: authError } = await assertAdmin(supabase)
  if (authError) return { success: false, error: authError }

  const { data: product } = await supabase
    .from('products')
    .select('image_url')
    .eq('id', productId)
    .eq('store_id', storeId)
    .single()

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId)
    .eq('store_id', storeId)

  if (error) return { success: false, error: error.message }

  if (product?.image_url) {
    try {
      const url = new URL(product.image_url)
      const pathParts = url.pathname.split('/product-images/')
      if (pathParts.length === 2) {
        await supabase.storage.from('product-images').remove([pathParts[1]])
      }
    } catch { /* non-critical */ }
  }

  return { success: true, error: null }
}

export async function getProductsForStore(storeId: string) {
  const supabase = createClient()
  const { error: authError } = await assertAdmin(supabase)
  if (authError) return { success: false, error: authError, products: [] }

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .order('name')

  if (error) return { success: false, error: error.message, products: [] }
  return { success: true, error: null, products: data || [] }
}

export async function getIngredientsForStore(storeId: string) {
  const supabase = createClient()
  const { error: authError } = await assertAdmin(supabase)
  if (authError) return { success: false, error: authError, ingredients: [] }

  const { data, error } = await supabase
    .from('ingredients')
    .select('id, name, unit')
    .eq('store_id', storeId)
    .order('name')

  if (error) return { success: false, error: error.message, ingredients: [] }
  return { success: true, error: null, ingredients: data || [] }
}
