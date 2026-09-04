'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, startOfDay, subDays } from 'date-fns'
import ReportsSummary from '@/components/ReportsSummary'
import IngredientUsageTable from '@/components/IngredientUsageTable'
import type { LinePoint } from '@/components/LineChart'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { formatDisplayId } from '@/lib/utils/display-id'

type RangeKey = 'today' | 'last7' | 'last30'

type Store = {
  id: string
  name: string
  owner_user_id: string
  created_at: string
}

export default function AdminReports({ stores }: { stores: Store[] }) {
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [salesData, setSalesData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeRange, setActiveRange] = useState<RangeKey>('today')
  const [compareRanges, setCompareRanges] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportingCsv, setExportingCsv] = useState<RangeKey | null>(null)
  const [csvRange, setCsvRange] = useState<RangeKey>('today')

  const pdfRef = useRef<HTMLDivElement | null>(null)

  const selectedStore = useMemo(
    () => stores.find((s) => s.id === selectedStoreId) || null,
    [stores, selectedStoreId]
  )

  const activeBlock = useMemo(() => {
    if (!salesData) return null
    return (salesData as any)[activeRange] ?? null
  }, [salesData, activeRange])

  function ingredientDateRangeFor(range: RangeKey) {
    switch (range) {
      case 'today':
        return 'today' as const
      case 'last7':
        return 'last7days' as const
      case 'last30':
        return 'last30days' as const
      default:
        return 'last30days' as const
    }
  }

  useEffect(() => {
    // Default to the newest store if none selected.
    if (!selectedStoreId && stores.length > 0) {
      setSelectedStoreId(stores[0].id)
    }
  }, [stores, selectedStoreId])

  useEffect(() => {
    // Remember export panel state for convenience.
    try {
      const v = localStorage.getItem('adminReports:showExport')
      setShowExport(v === '1')
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('adminReports:showExport', showExport ? '1' : '0')
    } catch {
      // ignore
    }
  }, [showExport])

  useEffect(() => {
    if (!selectedStoreId) return
    loadReportsData(selectedStoreId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId])

  async function loadReportsData(storeId: string) {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    const now = new Date()
    const start30 = startOfDay(subDays(now, 29))
    const start7 = startOfDay(subDays(now, 6))
    const startToday = startOfDay(now)

    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('*, sale_items(*, products(category, name))')
      .eq('store_id', storeId)
      .gte('sold_at', start30.toISOString())
      .lte('sold_at', now.toISOString())
      .order('sold_at', { ascending: true })

    if (salesError) {
      setError(salesError.message)
      setSalesData(null)
      setLoading(false)
      return
    }

    const allSales = (sales || []) as any[]
    const todaySales = allSales.filter((s) => new Date(s.sold_at) >= startToday)
    const last7Sales = allSales.filter((s) => new Date(s.sold_at) >= start7)
    const last30Sales = allSales

    function computeSummary(salesSubset: any[]) {
      const totalRevenue =
        salesSubset.reduce((sum, sale) => sum + parseFloat(sale.total_amount.toString()), 0) || 0
      const totalOrders = salesSubset.length || 0
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

      const productSales: Record<string, { quantity: number; name: string }> = {}
      salesSubset.forEach((sale) => {
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
      const topProductId = Object.entries(productSales).sort((a, b) => b[1].quantity - a[1].quantity)[0]?.[0]
      const topProductName = topProductId ? productSales[topProductId].name : 'N/A'

      const categorySales: Record<string, number> = {}
      salesSubset.forEach((sale) => {
        ;(sale.sale_items as any[]).forEach((item: any) => {
          const category = item.products?.category || 'Uncategorized'
          const itemTotal = parseFloat(item.price.toString()) * item.quantity
          categorySales[category] = (categorySales[category] || 0) + itemTotal
        })
      })

      const dailySales: Record<string, number> = {}
      salesSubset.forEach((sale) => {
        const date = format(new Date(sale.sold_at), 'yyyy-MM-dd')
        dailySales[date] = (dailySales[date] || 0) + parseFloat(sale.total_amount.toString())
      })

      return { totalRevenue, totalOrders, avgOrderValue, topProductName, categorySales, dailySales }
    }

    function buildHourlySeries(salesSubset: any[]): LinePoint[] {
      const totals: number[] = Array.from({ length: 24 }, () => 0)
      salesSubset.forEach((sale) => {
        const d = new Date(sale.sold_at)
        totals[d.getHours()] += parseFloat(sale.total_amount.toString())
      })
      return totals.map((value, h) => ({
        label: `${h.toString().padStart(2, '0')}:00`,
        value,
      }))
    }

    function buildDailySeries(salesSubset: any[], days: number): LinePoint[] {
      const points: LinePoint[] = []
      for (let i = days - 1; i >= 0; i--) {
        const d = subDays(now, i)
        const key = format(d, 'yyyy-MM-dd')
        points.push({
          label: format(d, 'MMM d'),
          value: salesSubset
            .filter((s) => format(new Date(s.sold_at), 'yyyy-MM-dd') === key)
            .reduce((sum, s) => sum + parseFloat(s.total_amount.toString()), 0),
        })
      }
      return points
    }

    setSalesData({
      generatedAt: now.toISOString(),
      rawSales: allSales,
      today: {
        title: 'Today',
        startDate: startToday,
        endDate: now,
        ...computeSummary(todaySales),
        series: buildHourlySeries(todaySales),
        labelEvery: 1,
      },
      last7: {
        title: 'Last 7 Days',
        startDate: start7,
        endDate: now,
        ...computeSummary(last7Sales),
        series: buildDailySeries(last7Sales, 7),
        labelEvery: 1,
      },
      last30: {
        title: 'Last 30 Days',
        startDate: start30,
        endDate: now,
        ...computeSummary(last30Sales),
        series: buildDailySeries(last30Sales, 30),
        labelEvery: 6,
      },
    })
    setLoading(false)
  }

  function downloadTextFile(filename: string, content: string, mime = 'text/plain') {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function getSalesForRange(rangeKey: RangeKey): any[] {
    const raw = (salesData?.rawSales || []) as any[]
    const block = salesData?.[rangeKey]
    if (!block) return []
    const start = new Date(block.startDate)
    const end = new Date(block.endDate)
    return raw.filter((s) => {
      const t = new Date(s.sold_at).getTime()
      return t >= start.getTime() && t <= end.getTime()
    })
  }

  function exportCsv(rangeKey: RangeKey) {
    const now = new Date()
    const sales = getSalesForRange(rangeKey)

    const headers = [
      'Sale ID',
      'Date',
      'Time',
      'Payment Method',
      'Product Name',
      'Category',
      'Quantity',
      'Unit Price',
      'Line Total',
      'Sale Total',
    ]

    const rows: string[][] = []

    sales.forEach((sale: any) => {
      const soldAt = new Date(sale.sold_at)
      const dateStr = soldAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      const timeStr = soldAt.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })

      const saleItems = (sale.sale_items as any[]) || []
      const saleTotal = parseFloat(sale.total_amount?.toString?.() ?? `${sale.total_amount ?? 0}`)

      if (saleItems.length === 0) {
        rows.push([
          formatDisplayId(sale.id, 'ORD'),
          dateStr,
          timeStr,
          sale.payment_method || 'N/A',
          '',
          '',
          '',
          '',
          '',
          `₱${saleTotal.toFixed(2)}`,
        ])
        return
      }

      saleItems.forEach((item: any, idx: number) => {
        const product = item.products || {}
        const unitPrice = parseFloat(item.price?.toString?.() ?? `${item.price ?? 0}`)
        const qty = Number(item.quantity || 0)
        const lineTotal = unitPrice * qty

        rows.push([
          idx === 0 ? formatDisplayId(sale.id, 'ORD') : '',
          idx === 0 ? dateStr : '',
          idx === 0 ? timeStr : '',
          idx === 0 ? (sale.payment_method || 'N/A') : '',
          product.name || 'N/A',
          product.category || 'N/A',
          `${qty}`,
          `₱${unitPrice.toFixed(2)}`,
          `₱${lineTotal.toFixed(2)}`,
          idx === 0 ? `₱${saleTotal.toFixed(2)}` : '',
        ])
      })
    })

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')),
    ].join('\n')

    const safeStoreName = (selectedStore?.name || 'store').replaceAll(/[^a-zA-Z0-9_-]+/g, '-')
    const filename = `admin-sales-report-${safeStoreName}-${rangeKey}-${format(now, 'yyyy-MM-dd')}.csv`
    downloadTextFile(filename, csv, 'text/csv')
  }

  async function exportPdf() {
    if (!pdfRef.current) return
    if (exportingPdf) return
    setExportingPdf(true)
    try {
      await new Promise((r) => setTimeout(r, 50))

      const canvas = await html2canvas(pdfRef.current, {
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })

      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()

      const imgHeight = (canvas.height * pageWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0

      pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight)
      heightLeft -= pageHeight

      while (heightLeft > 0) {
        position -= pageHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight)
        heightLeft -= pageHeight
      }

      const safeStoreName = (selectedStore?.name || 'store').replaceAll(/[^a-zA-Z0-9_-]+/g, '-')
      const filename = `admin-reports-${safeStoreName}-${format(new Date(), 'yyyy-MM-dd')}.pdf`
      pdf.save(filename)
    } finally {
      setExportingPdf(false)
    }
  }

  if (stores.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-900">Reports</h2>
        <p className="mt-2 text-sm text-slate-600">No stores exist yet. Create a user/store first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 sticky top-0 z-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Reports</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {compareRanges ? 'Comparing: Today + 7 + 30 Days' : `Viewing: ${activeBlock?.title ?? ''}`}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <select
              className="flex-1 min-w-0 h-12 px-4 rounded-xl border border-slate-300 bg-white text-base font-medium"
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              aria-label="Select store"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setCompareRanges((v) => !v)}
              className="flex-shrink-0 h-12 px-4 rounded-xl bg-white text-gray-900 text-base font-medium border border-gray-300 hover:bg-gray-50"
            >
              {compareRanges ? 'One range' : 'Compare'}
            </button>

            <button
              type="button"
              onClick={() => setShowExport((v) => !v)}
              className="flex-shrink-0 flex items-center justify-center gap-2 h-12 px-4 rounded-xl bg-white text-gray-900 text-base font-medium border border-gray-300 hover:bg-gray-50"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>download</span>
              <span>{showExport ? 'Hide' : 'Export'}</span>
            </button>
          </div>
        </div>

        {showExport && (
          <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-sm text-slate-700">
              Export options for {selectedStore?.name || 'this store'} ({compareRanges ? 'all ranges' : (activeBlock?.title ?? 'this range')}).
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-3">
            <button
              type="button"
              onClick={() => exportPdf()}
              disabled={exportingPdf || loading || !salesData}
              className="flex items-center justify-center gap-2 h-12 px-5 rounded-xl bg-button-gray text-gray-900 text-base font-medium border border-gray-300 hover:bg-[#D0D0D0] disabled:opacity-60 disabled:cursor-not-allowed"
              title="Export the full report to PDF"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>
                picture_as_pdf
              </span>
              <span className="truncate">{exportingPdf ? 'Exporting…' : 'Export PDF'}</span>
            </button>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <select
                className="h-12 px-4 rounded-xl border border-slate-300 bg-white text-base font-medium"
                value={csvRange}
                onChange={(e) => setCsvRange(e.target.value as RangeKey)}
                aria-label="Select CSV range"
              >
                <option value="today">CSV Today</option>
                <option value="last7">CSV 7 days</option>
                <option value="last30">CSV 30 days</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setExportingCsv(csvRange)
                  try {
                    exportCsv(csvRange)
                  } finally {
                    setExportingCsv(null)
                  }
                }}
                className="flex items-center justify-center gap-2 h-12 px-5 rounded-xl bg-white text-gray-900 text-base font-medium border border-gray-300 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={exportingPdf || exportingCsv !== null || loading || !salesData}
                title="Download CSV for the selected range"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>
                  download
                </span>
                <span className="truncate">{exportingCsv ? 'Downloading…' : 'Download CSV'}</span>
              </button>
            </div>
          </div>
          </div>
        )}

        {!compareRanges && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1 w-full md:w-fit overflow-x-auto">
            {(['today', 'last7', 'last30'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setActiveRange(k)}
                className={`flex-1 md:flex-none shrink-0 px-4 py-3 text-base font-medium rounded-xl transition-colors ${
                  activeRange === k ? 'bg-primary text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {k === 'today' ? 'Today' : k === 'last7' ? '7 Days' : '30 Days'}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">Couldn’t load reports.</p>
          <p className="mt-1 text-xs text-red-700">Error: {error}</p>
        </div>
      )}

      {loading || !salesData ? (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500">{loading ? 'Loading reports…' : 'Select a store to view reports.'}</p>
        </div>
      ) : (
        <>
          <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{selectedStore?.name || 'Store'}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Generated {format(new Date(salesData.generatedAt), 'yyyy-MM-dd HH:mm')}
                </p>
              </div>
            </div>
          </div>

          {compareRanges ? (
            <div className="space-y-10">
              {(['today', 'last7', 'last30'] as const).map((key) => {
                const block = (salesData as any)[key]
                return (
                  <section key={key} className="space-y-4">
                    <h3 className="text-xl font-semibold text-slate-900">{block.title}</h3>
                    <ReportsSummary
                      totalRevenue={block.totalRevenue}
                      totalOrders={block.totalOrders}
                      avgOrderValue={block.avgOrderValue}
                      topProductName={block.topProductName}
                      categorySales={block.categorySales}
                      dailySales={block.dailySales}
                      startDate={block.startDate}
                      endDate={block.endDate}
                      series={block.series}
                      labelEvery={block.labelEvery}
                    />
                  </section>
                )
              })}
            </div>
          ) : activeBlock ? (
            <section className="space-y-4">
              <ReportsSummary
                totalRevenue={activeBlock.totalRevenue}
                totalOrders={activeBlock.totalOrders}
                avgOrderValue={activeBlock.avgOrderValue}
                topProductName={activeBlock.topProductName}
                categorySales={activeBlock.categorySales}
                dailySales={activeBlock.dailySales}
                startDate={activeBlock.startDate}
                endDate={activeBlock.endDate}
                series={activeBlock.series}
                labelEvery={activeBlock.labelEvery}
              />
            </section>
          ) : null}

          <div className="mt-8">
            <IngredientUsageTable
              dateRange={compareRanges ? 'last30days' : ingredientDateRangeFor(activeRange)}
              storeId={selectedStoreId}
            />
          </div>
        </>
      )}

      {/* Off-screen PDF render (prevents scroll clipping and regenerates charts from data). */}
      <div
        ref={pdfRef}
        style={{
          position: 'fixed',
          left: -10000,
          top: 0,
          width: 980,
          background: '#ffffff',
          padding: 24,
          color: '#0f172a',
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            Reports — {selectedStore?.name || 'Store'}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Generated {format(new Date(), 'yyyy-MM-dd HH:mm')}
          </div>
        </div>

        {salesData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {(compareRanges ? (['today', 'last7', 'last30'] as const) : ([activeRange] as const)).map((key) => {
              const block = (salesData as any)[key]
              return (
                <div key={`pdf-${key}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{block.title}</div>
                  <ReportsSummary
                    totalRevenue={block.totalRevenue}
                    totalOrders={block.totalOrders}
                    avgOrderValue={block.avgOrderValue}
                    topProductName={block.topProductName}
                    categorySales={block.categorySales}
                    dailySales={block.dailySales}
                    startDate={block.startDate}
                    endDate={block.endDate}
                    series={block.series}
                    labelEvery={block.labelEvery}
                    chartScrollable={false}
                    chartMinWidthPx={900}
                  />
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}


