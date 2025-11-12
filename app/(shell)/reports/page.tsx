import { createServerClient } from '@/lib/supabase/server'
import { format, startOfDay, endOfDay, subDays } from 'date-fns'
import IngredientUsageTable from '@/components/IngredientUsageTable'
import ReportsSummary from '@/components/ReportsSummary'

export default async function ReportsPage() {
  const supabase = createServerClient()

  // Get today's date range
  const today = new Date()
  const todayStart = startOfDay(today)
  const todayEnd = endOfDay(today)

  // Get today's sessions
  const { data: todaySessions } = await supabase
    .from('sessions')
    .select('*')
    .gte('opened_at', todayStart.toISOString())
    .lte('opened_at', todayEnd.toISOString())
    .order('opened_at', { ascending: false })

  // Get today's sales
  const { data: todaySales } = await supabase
    .from('sales')
    .select('*, sale_items(*)')
    .gte('sold_at', todayStart.toISOString())
    .lte('sold_at', todayEnd.toISOString())

  // Calculate totals
  const totalRevenue =
    todaySales?.reduce((sum, sale) => sum + parseFloat(sale.total_amount.toString()), 0) || 0
  const totalOrders = todaySales?.length || 0
  const totalItems =
    todaySales?.reduce(
      (sum, sale) =>
        sum +
        (sale.sale_items as any[]).reduce((itemSum, item) => itemSum + item.quantity, 0),
      0
    ) || 0
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

  // Get top selling product
  const productSales: Record<string, number> = {}
  todaySales?.forEach((sale) => {
    ;(sale.sale_items as any[]).forEach((item: any) => {
      productSales[item.product_id] = (productSales[item.product_id] || 0) + item.quantity
    })
  })

  const topProductId = Object.entries(productSales).sort((a, b) => b[1] - a[1])[0]?.[0]
  let topProductName = 'N/A'
  if (topProductId) {
    const { data: product } = await supabase
      .from('products')
      .select('name')
      .eq('id', topProductId)
      .single()
    topProductName = product?.name || 'N/A'
  }

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex flex-col">
            <h1 className="text-3xl font-bold text-black dark:text-white">Reports Dashboard</h1>
            <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
              Daily and session totals for your shop.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-md h-9 px-3 bg-white dark:bg-black text-black dark:text-white text-sm font-medium border border-slate-200 dark:border-gray-800 gap-2 hover:bg-slate-50 dark:hover:bg-gray-900 transition-colors">
              <span
                className="material-symbols-outlined text-slate-500 dark:text-gray-400"
                style={{ fontSize: '20px' }}
              >
                calendar_today
              </span>
              <span className="truncate">Today: {format(today, 'MMM d, yyyy')}</span>
            </button>
            <a
              href="/api/reports/ingredient-usage.csv"
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-md h-9 px-3 bg-black text-white dark:bg-white dark:text-black text-sm font-medium gap-2 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                download
              </span>
              <span className="truncate">Export as CSV</span>
            </a>
          </div>
        </div>

        <ReportsSummary
          totalRevenue={totalRevenue}
          totalOrders={totalOrders}
          avgOrderValue={avgOrderValue}
          topProductName={topProductName}
        />

        <div className="mt-8">
          <IngredientUsageTable />
        </div>
      </div>
    </div>
  )
}

