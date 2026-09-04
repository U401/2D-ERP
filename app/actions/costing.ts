import { createClient } from '@/lib/supabase/client'

export type ProductCostData = {
  product_id: string
  product_name: string
  selling_price: number
  total_ingredient_cost: number
  gross_profit: number
  margin_percentage: number
  store_name: string
  max_orders: number
  batch_cost: number
  batch_revenue: number
  batch_profit: number
  recipe_details: {
    ingredient_id: string
    ingredient_name: string
    unit: string
    cost_per_unit: number
    quantity_used: number
    current_stock: number
    total_cost: number
    purchase_price: number | null
    purchase_yield: number | null
    purchase_unit: string | null
  }[]
}

export async function getFoodCostingData(storeId?: string): Promise<{ success: boolean; data?: ProductCostData[]; error?: string }> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return { success: false, error: 'Only admins can access costing data' }
    }

    // Fetch all products, their recipes, and ingredients
    // Need to join products -> recipes -> ingredients
    let productsQuery = supabase
      .from('products')
      .select(`
        id, 
        name, 
        price,
        store_id,
        stores (name),
        recipes (
          quantity,
          ingredients (
            id,
            name,
            unit,
            current_stock,
            purchase_yield,
            purchase_price
          )
        )
      `)

    if (storeId) {
      productsQuery = productsQuery.eq('store_id', storeId)
    }

    const { data: products, error } = await productsQuery

    if (error) throw error

    const costingData: ProductCostData[] = products.map(product => {
      let maxOrders = Infinity

      const recipeDetails = product.recipes.map((recipe: any) => {
        const quantity = recipe.quantity || 0
        const currentStock = recipe.ingredients.current_stock || 0
        const purchaseYield = recipe.ingredients.purchase_yield || 0
        const purchasePrice = recipe.ingredients.purchase_price || 0
        
        // Auto calculate cost per unit
        const costPerUnit = (purchaseYield > 0 && purchasePrice > 0) ? (purchasePrice / purchaseYield) : 0
        
        // Calculate max orders from a single fresh batch of this ingredient
        if (quantity > 0) {
          const canMake = purchaseYield > 0 ? Math.floor(purchaseYield / quantity) : 0
          if (canMake < maxOrders) {
            maxOrders = canMake
          }
        }

        return {
          ingredient_id: recipe.ingredients.id,
          ingredient_name: recipe.ingredients.name,
          unit: recipe.ingredients.unit,
          cost_per_unit: costPerUnit,
          quantity_used: quantity,
          current_stock: currentStock,
          total_cost: costPerUnit * quantity,
          purchase_price: recipe.ingredients.purchase_price,
          purchase_yield: purchaseYield,
          purchase_unit: recipe.ingredients.purchase_unit
        }
      })

      if (maxOrders === Infinity || recipeDetails.length === 0) {
        maxOrders = 0
      }

      const totalIngredientCost = recipeDetails.reduce((sum: number, item: any) => sum + item.total_cost, 0)
      const sellingPrice = product.price || 0
      const grossProfit = sellingPrice - totalIngredientCost
      const marginPercentage = sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0

      const batchCost = totalIngredientCost * maxOrders
      const batchRevenue = sellingPrice * maxOrders
      const batchProfit = batchRevenue - batchCost

      return {
        product_id: product.id,
        product_name: product.name,
        selling_price: sellingPrice,
        total_ingredient_cost: totalIngredientCost,
        gross_profit: grossProfit,
        margin_percentage: marginPercentage,
        store_id: product.store_id,
        store_name: Array.isArray(product.stores) ? product.stores[0]?.name || 'Unknown Store' : (product.stores as any)?.name || 'Unknown Store',
        max_orders: maxOrders,
        batch_cost: batchCost,
        batch_revenue: batchRevenue,
        batch_profit: batchProfit,
        recipe_details: recipeDetails
      }
    })

    return { success: true, data: costingData }
  } catch (err: any) {
    console.error('Error fetching food costing data:', err)
    return { success: false, error: err.message || 'Failed to fetch costing data' }
  }
}

export async function updateProductPrice(productId: string, newPrice: number) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('store_id, role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return { success: false, error: 'Only admins can update product prices' }
    }

    let query = supabase
      .from('products')
      .update({ price: newPrice })
      .eq('id', productId)

    if (profile.store_id) {
      query = query.eq('store_id', profile.store_id)
    }

    const { error } = await query

    if (error) throw error

    return { success: true }
  } catch (err: any) {
    console.error('Error updating product price:', err)
    return { success: false, error: err.message || 'Failed to update price' }
  }
}
