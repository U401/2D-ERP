import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { startOfDay, endOfDay } from 'date-fns'

export async function GET() {
  const supabase = createServerClient()
  const today = new Date()
  const todayStart = startOfDay(today)
  const todayEnd = endOfDay(today)

  // Get ingredient usage
  const { data: usageData, error } = await supabase.rpc('ingredient_usage', {
    p_from: todayStart.toISOString(),
    p_to: todayEnd.toISOString(),
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get all ingredients
  const { data: allIngredients } = await supabase
    .from('ingredients')
    .select('*')
    .order('name')

  const usageMap = new Map(
    (usageData || []).map((u: any) => [u.ingredient_id, u.used_quantity])
  )

  // Build CSV
  const headers = ['Ingredient Name', 'Unit', 'Used Quantity', 'Current Stock', 'Low Stock Threshold']
  const rows = (allIngredients || []).map((ing) => {
    const used = usageMap.get(ing.id) || 0
    return [
      ing.name,
      ing.unit,
      parseFloat(used.toString()).toFixed(2),
      ing.current_stock.toString(),
      ing.low_stock_threshold.toString(),
    ]
  })

  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="ingredient-usage-${today.toISOString().split('T')[0]}.csv"`,
    },
  })
}

