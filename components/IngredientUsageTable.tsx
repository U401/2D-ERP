import { createServerClient } from '@/lib/supabase/server'
import { startOfDay, endOfDay } from 'date-fns'

export default async function IngredientUsageTable() {
  const supabase = createServerClient()
  const today = new Date()
  const todayStart = startOfDay(today)
  const todayEnd = endOfDay(today)

  // Get ingredient usage via RPC
  const { data: usageData, error } = await supabase.rpc('ingredient_usage', {
    p_from: todayStart.toISOString(),
    p_to: todayEnd.toISOString(),
  })

  if (error) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-black p-6">
        <p className="text-red-500">Error loading ingredient usage: {error.message}</p>
      </div>
    )
  }

  // Get all ingredients for display (even if not used today)
  const { data: allIngredients } = await supabase
    .from('ingredients')
    .select('*')
    .order('name')

  // Merge usage data with ingredients
  const usageMap = new Map(
    (usageData || []).map((u: any) => [u.ingredient_id, u.used_quantity])
  )

  const tableData =
    allIngredients?.map((ing) => ({
      ...ing,
      used_quantity: usageMap.get(ing.id) || 0,
    })) || []

  return (
    <div className="rounded-xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-black overflow-hidden">
      <div className="p-6">
        <h3 className="text-base font-medium text-black dark:text-white">Ingredient Usage</h3>
        <p className="text-slate-500 dark:text-gray-400 text-sm mt-1">
          Report for today.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-black/20 text-slate-600 dark:text-slate-300">
            <tr>
              <th className="px-6 py-3 font-medium" scope="col">
                Ingredient Name
              </th>
              <th className="px-6 py-3 font-medium text-right" scope="col">
                Used Qty
              </th>
              <th className="px-6 py-3 font-medium text-right" scope="col">
                Current Stock
              </th>
              <th className="px-6 py-3 font-medium" scope="col">
                Unit
              </th>
            </tr>
          </thead>
          <tbody className="text-slate-800 dark:text-gray-300 divide-y divide-slate-100 dark:divide-gray-800">
            {tableData.map((ingredient) => (
              <tr key={ingredient.id}>
                <td className="px-6 py-4 font-medium text-black dark:text-white">
                  {ingredient.name}
                </td>
                <td className="px-6 py-4 text-right">
                  {parseFloat(ingredient.used_quantity.toString()).toFixed(2)}
                </td>
                <td className="px-6 py-4 text-right">{ingredient.current_stock}</td>
                <td className="px-6 py-4 text-slate-500 dark:text-gray-400">
                  {ingredient.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

