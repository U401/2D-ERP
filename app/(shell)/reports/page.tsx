'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, startOfDay, endOfDay, subDays } from 'date-fns'
import IngredientUsageTable from '@/components/IngredientUsageTable'
import ReportsSummary from '@/components/ReportsSummary'

type DateRange = 'today' | 'last7days' | 'last30days'

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState<DateRange>('today')
  const [salesData, setSalesData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReportsData()
  }, [dateRange])

  async function loadReportsData() {
    setLoading(true)
    const supabase = createClient()

    let startDate: Date
    let endDate = endOfDay(new Date())
    let previousStartDate: Date
    let previousEndDate: Date

    switch (dateRange) {
      case 'today':
        startDate = startOfDay(new Date())
        previousStartDate = startOfDay(subDays(new Date(), 1))
        previousEndDate = endOfDay(subDays(new Date(), 1))
        break
      case 'last7days':
        startDate = startOfDay(subDays(new Date(), 7))
        previousStartDate = startOfDay(subDays(new Date(), 14))
        previousEndDate = endOfDay(subDays(new Date(), 8))
        break
      case 'last30days':
        startDate = startOfDay(subDays(new Date(), 30))
        previousStartDate = startOfDay(subDays(new Date(), 60))
        previousEndDate = endOfDay(subDays(new Date(), 31))
        break
      default:
        startDate = startOfDay(subDays(new Date(), 30))
        previousStartDate = startOfDay(subDays(new Date(), 60))
        previousEndDate = endOfDay(subDays(new Date(), 31))
    }

    // Get current period sales
    const { data: sales } = await supabase
      .from('sales')
      .select('*, sale_items(*, products(category, name))')
      .gte('sold_at', startDate.toISOString())
      .lte('sold_at', endDate.toISOString())
      .order('sold_at', { ascending: true })

    // Get previous period sales for comparison
    const { data: previousSales } = await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .gte('sold_at', previousStartDate.toISOString())
      .lte('sold_at', previousEndDate.toISOString())

    // Calculate current period totals
    const totalRevenue =
      sales?.reduce((sum, sale) => sum + parseFloat(sale.total_amount.toString()), 0) || 0
    const totalOrders = sales?.length || 0
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

    // Calculate previous period totals
    const previousRevenue =
      previousSales?.reduce((sum, sale) => sum + parseFloat(sale.total_amount.toString()), 0) || 0
    const previousOrders = previousSales?.length || 0
    const previousAvgOrderValue = previousOrders > 0 ? previousRevenue / previousOrders : 0

    // Calculate percentage changes
    const revenueChange =
      previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0
    const ordersChange =
      previousOrders > 0 ? ((totalOrders - previousOrders) / previousOrders) * 100 : 0
    const avgOrderChange =
      previousAvgOrderValue > 0
        ? ((avgOrderValue - previousAvgOrderValue) / previousAvgOrderValue) * 100
        : 0

    // Get top selling product
    const productSales: Record<string, { quantity: number; name: string }> = {}
    sales?.forEach((sale) => {
      ;(sale.sale_items as any[]).forEach((item: any) => {
        if (!productSales[item.product_id]) {
          productSales[item.product_id] = {
            quantity: 0,
            name: item.products?.name || 'Unknown',
          }
        }
        productSales[item.product_id].quantity += item.quantity
      })
    })

    const topProductId = Object.entries(productSales).sort(
      (a, b) => b[1].quantity - a[1].quantity
    )[0]?.[0]
    const topProductName = topProductId ? productSales[topProductId].name : 'N/A'

    // Calculate sales by category
    const categorySales: Record<string, number> = {}
    sales?.forEach((sale) => {
      ;(sale.sale_items as any[]).forEach((item: any) => {
        const category = item.products?.category || 'Uncategorized'
        const itemTotal = parseFloat(item.price.toString()) * item.quantity
        categorySales[category] = (categorySales[category] || 0) + itemTotal
      })
    })

    // Calculate daily sales for chart
    const dailySales: Record<string, number> = {}
    sales?.forEach((sale) => {
      const date = format(new Date(sale.sold_at), 'yyyy-MM-dd')
      dailySales[date] = (dailySales[date] || 0) + parseFloat(sale.total_amount.toString())
    })

    // Get previous period top product for comparison
    const previousProductSales: Record<string, number> = {}
    previousSales?.forEach((sale) => {
      ;(sale.sale_items as any[]).forEach((item: any) => {
        previousProductSales[item.product_id] =
          (previousProductSales[item.product_id] || 0) + item.quantity
      })
    })
    const previousTopProductId = Object.entries(previousProductSales).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0]
    const topProductChange =
      previousTopProductId === topProductId && previousProductSales[previousTopProductId]
        ? ((productSales[topProductId]?.quantity || 0) - previousProductSales[previousTopProductId]) /
          previousProductSales[previousTopProductId] /
          100
        : 0

    setSalesData({
      totalRevenue,
      totalOrders,
      avgOrderValue,
      topProductName,
      sales,
      revenueChange,
      ordersChange,
      avgOrderChange,
      topProductChange,
      categorySales,
      dailySales,
      startDate,
      endDate,
    })
    setLoading(false)
  }

  const getDateRangeLabel = () => {
    switch (dateRange) {
      case 'today':
        return 'Today'
      case 'last7days':
        return 'Last 7 Days'
      case 'last30days':
        return 'Last 30 Days'
      default:
        return 'Last 30 Days'
    }
  }

  if (loading || !salesData) {
    return (
      <div className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <p className="text-gray-500">Loading reports...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <h1 className="text-3xl font-bold text-black">Reports Dashboard</h1>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative inline-block text-left">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateRange)}
                className="appearance-none flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-md h-9 pl-3 pr-8 bg-input-gray text-slate-700 text-sm font-medium border border-gray-300 gap-2 hover:bg-[#E5E5E5] transition-colors"
              >
                <option value="today">Today</option>
                <option value="last7days">Last 7 Days</option>
                <option value="last30days">Last 30 Days</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-700">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                  expand_more
                </span>
              </div>
            </div>
            <a
              href={`/api/reports/sales.csv?range=${dateRange}`}
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-md h-9 px-3 bg-button-gray text-gray-900 text-sm font-medium gap-2 hover:bg-[#D0D0D0] transition-colors border border-gray-200"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                download
              </span>
              <span className="truncate">Export as CSV</span>
            </a>
          </div>
        </div>

        <ReportsSummary
          totalRevenue={salesData.totalRevenue}
          totalOrders={salesData.totalOrders}
          avgOrderValue={salesData.avgOrderValue}
          topProductName={salesData.topProductName}
          revenueChange={salesData.revenueChange}
          ordersChange={salesData.ordersChange}
          avgOrderChange={salesData.avgOrderChange}
          topProductChange={salesData.topProductChange}
          categorySales={salesData.categorySales}
          dailySales={salesData.dailySales}
          startDate={salesData.startDate}
          endDate={salesData.endDate}
        />

        <div className="mt-8">
          <IngredientUsageTable dateRange={dateRange} />
        </div>
      </div>
    </div>
  )
}
