'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { startOfDay, endOfDay, subDays } from 'date-fns'

type DateRange = 'today' | 'last7days' | 'last30days' | 'custom'

type Props = {
  dateRange?: DateRange
}

export default function IngredientUsageTable({ dateRange = 'last30days' }: Props) {
  const [usageData, setUsageData] = useState<any[]>([])
  const [ingredients, setIngredients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadIngredientUsage()
  }, [dateRange])

  async function loadIngredientUsage() {
    setLoading(true)
    const supabase = createClient()

    let startDate: Date
    let endDate = endOfDay(new Date())

    switch (dateRange) {
      case 'today':
        startDate = startOfDay(new Date())
        break
      case 'last7days':
        startDate = startOfDay(subDays(new Date(), 7))
        break
      case 'last30days':
        startDate = startOfDay(subDays(new Date(), 30))
        break
      default:
        startDate = startOfDay(subDays(new Date(), 30))
    }

    // Get ingredient usage via RPC
    const { data: usage, error } = await supabase.rpc('ingredient_usage', {
      p_from: startDate.toISOString(),
      p_to: endDate.toISOString(),
    })

    if (error) {
      console.error('Error loading ingredient usage:', error)
      setLoading(false)
      return
    }

    // Get all ingredients for display
    const { data: allIngredients } = await supabase
      .from('ingredients')
      .select('*')
      .order('name')

    // Merge usage data with ingredients
    const usageMap = new Map(
      (usage || []).map((u: any) => [
        u.ingredient_id,
        { used_quantity: u.used_quantity || 0, remaining_stock: u.remaining_stock || 0 },
      ])
    )

    const tableData =
      allIngredients?.map((ing) => {
        const usageInfo = usageMap.get(ing.id) || { used_quantity: 0, remaining_stock: ing.current_stock }
        const startingQty = usageInfo.remaining_stock + usageInfo.used_quantity
        return {
          ...ing,
          used_quantity: usageInfo.used_quantity,
          starting_qty: startingQty,
          ending_qty: usageInfo.remaining_stock,
        }
      }) || []

    setUsageData(tableData)
    setIngredients(allIngredients || [])
    setLoading(false)
  }

  const getDateRangeLabel = () => {
    switch (dateRange) {
      case 'today':
        return 'today'
      case 'last7days':
        return 'the last 7 days'
      case 'last30days':
        return 'the last 30 days'
      case 'custom':
        return 'the selected period'
      default:
        return 'the selected period'
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-slate-500">Loading ingredient usage...</p>
      </div>
    )
  }

  return (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="p-6">
            <h3 className="text-base font-medium text-black">Ingredient Usage</h3>
            <p className="text-slate-500 text-sm mt-1">
          Report for {getDateRangeLabel()}.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-6 py-3 font-medium" scope="col">
                Ingredient Name
              </th>
              <th className="px-6 py-3 font-medium" scope="col">
                Starting Qty
              </th>
              <th className="px-6 py-3 font-medium" scope="col">
                Used Qty
              </th>
              <th className="px-6 py-3 font-medium" scope="col">
                Ending Qty
              </th>
              <th className="px-6 py-3 font-medium" scope="col">
                Unit
              </th>
            </tr>
          </thead>
          <tbody className="text-slate-800 divide-y divide-slate-200">
            {usageData.length > 0 ? (
              usageData.map((ingredient) => (
                <tr key={ingredient.id} className="border-b border-slate-200">
                  <td className="px-6 py-4 font-medium">{ingredient.name}</td>
                  <td className="px-6 py-4">
                    {parseFloat((ingredient.starting_qty || ingredient.current_stock + ingredient.used_quantity).toString()).toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    {parseFloat(ingredient.used_quantity.toString()).toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    {parseFloat((ingredient.ending_qty || ingredient.current_stock).toString()).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-slate-500">{ingredient.unit}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  No ingredient usage data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {usageData.length > 0 && (
        <div className="flex items-center justify-between p-4 text-sm text-slate-500 border-t border-slate-200">
          <div>Showing 1 to {usageData.length} of {usageData.length} results</div>
        </div>
      )}
    </div>
  )
}
