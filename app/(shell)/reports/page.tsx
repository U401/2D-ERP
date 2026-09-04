'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, startOfDay, subDays } from 'date-fns'
import IngredientUsageTable from '@/components/IngredientUsageTable'
import ReportsSummary from '@/components/ReportsSummary'
import type { LinePoint } from '@/components/LineChart'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

type RangeKey = 'today' | 'last7' | 'last30'

export default function ReportsPage() {
  const [salesData, setSalesData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeRange, setActiveRange] = useState<RangeKey>('today')
  const [compareRanges, setCompareRanges] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportingCsv, setExportingCsv] = useState(false)
  const [csvRange, setCsvRange] = useState<RangeKey>('today')

  const pdfRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    loadReportsData()
  }, [])

  useEffect(() => {
    try {
      const v = localStorage.getItem('reports:showExport')
      setShowExport(v === '1')
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('reports:showExport', showExport ? '1' : '0')
    } catch {
      // ignore
    }
  }, [showExport])

  async function loadReportsData() {
    setLoading(true)
    const supabase = createClient()

    const now = new Date()
    const start30 = startOfDay(subDays(now, 29))
    const start7 = startOfDay(subDays(now, 6))
    const startToday = startOfDay(now)

    // Single query: last 30 days (including today) through now.
    const { data: sales } = await supabase
      .from('sales')
      .select('*, sale_items(*, products(category, name))')
      .gte('sold_at', start30.toISOString())
      .lte('sold_at', now.toISOString())
      .order('sold_at', { ascending: true })

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

  const ranges = useMemo(() => {
    if (!salesData) return null
    return (['today', 'last7', 'last30'] as const).map((k) => ({
      key: k,
      title: salesData[k].title as string,
      startDate: salesData[k].startDate as Date,
      endDate: salesData[k].endDate as Date,
    }))
  }, [salesData])

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
          sale.id?.slice?.(0, 8) ?? '',
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
          idx === 0 ? (sale.id?.slice?.(0, 8) ?? '') : '',
          idx === 0 ? dateStr : '',
          idx === 0 ? timeStr : '',
          idx === 0 ? (sale.payment_method || 'N/A') : '',
          product.name || 'N/A',
          product.category || 'N/A',
          `${qty}`,
          `$${unitPrice.toFixed(2)}`,
          `$${lineTotal.toFixed(2)}`,
          idx === 0 ? `₱${saleTotal.toFixed(2)}` : '',
        ])
      })
    })

    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')
      ),
    ].join('\n')

    const filename = `sales-report-${rangeKey}-${format(now, 'yyyy-MM-dd')}.csv`
    downloadTextFile(filename, csv, 'text/csv')
  }

  async function exportPdf() {
    if (!pdfRef.current) return
    if (exportingPdf) return
    setExportingPdf(true)
    try {
      // Give the browser a tick to ensure fonts/layout are ready
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

      const filename = `reports-${format(new Date(), 'yyyy-MM-dd')}.pdf`
      pdf.save(filename)
    } finally {
      setExportingPdf(false)
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
    <div className="flex-1 p-6 sm:p-8 lg:p-10">
      <div className="w-full max-w-7xl mx-auto">
        <div className="flex flex-col gap-6 mb-10">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-black">Reports</h1>
              <p className="text-base text-slate-600 mt-2">
                {compareRanges ? 'Comparing: Today + Last 7 Days + Last 30 Days' : `Viewing: ${activeBlock?.title ?? ''}`}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <button
                type="button"
                onClick={() => setCompareRanges((v) => !v)}
                className="h-12 px-4 rounded-md bg-white text-gray-900 text-base font-medium border border-gray-200 hover:bg-gray-50"
                title="Compare all ranges at once"
              >
                {compareRanges ? 'Show one range' : 'Compare ranges'}
              </button>

              <button
                type="button"
                onClick={() => setShowExport((v) => !v)}
                className="flex items-center justify-center gap-3 h-12 px-4 rounded-md bg-white text-gray-900 text-base font-medium border border-gray-200 hover:bg-gray-50"
                title="Show export options"
              >
                <span className="material-symbols-outlined icon-lg">
                  download
                </span>
                <span className="truncate">{showExport ? 'Hide Export' : 'Export'}</span>
              </button>
            </div>
          </div>

          {/* Range tabs (hidden when comparing all ranges) */}
          {!compareRanges && (
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-1.5 w-fit overflow-x-auto">
              {(['today', 'last7', 'last30'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setActiveRange(k)}
                  className={`shrink-0 px-5 py-3 text-base font-semibold rounded-md transition-colors ${
                    activeRange === k ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {k === 'today' ? 'Today' : k === 'last7' ? '7d' : '30d'}
                </button>
              ))}
            </div>
          )}

          {showExport && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 md:p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-slate-700">
                  Export options for {compareRanges ? 'all ranges' : (activeBlock?.title ?? 'this range')}.
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <button
                    type="button"
                    onClick={() => exportPdf()}
                    disabled={exportingPdf}
                    className="flex items-center justify-center gap-2 h-10 px-3 rounded-md bg-button-gray text-gray-900 text-sm font-medium border border-gray-200 hover:bg-[#D0D0D0] disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Export the current report view to PDF"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                      picture_as_pdf
                    </span>
                    <span className="truncate">{exportingPdf ? 'Exporting…' : 'Export PDF'}</span>
                  </button>

                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <select
                      className="h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                      value={csvRange}
                      onChange={(e) => setCsvRange(e.target.value as RangeKey)}
                      aria-label="Select CSV range"
                      disabled={compareRanges}
                      title={compareRanges ? 'CSV export is per-range. Switch to single-range view.' : 'Select CSV range'}
                    >
                      <option value="today">CSV Today</option>
                      <option value="last7">CSV 7 days</option>
                      <option value="last30">CSV 30 days</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setExportingCsv(true)
                        try {
                          exportCsv(compareRanges ? activeRange : csvRange)
                        } finally {
                          setExportingCsv(false)
                        }
                      }}
                      className="flex items-center justify-center gap-2 h-10 px-3 rounded-md bg-white text-gray-900 text-sm font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                      disabled={exportingPdf || exportingCsv || compareRanges}
                      title={compareRanges ? 'CSV export is per-range. Switch to single-range view.' : 'Download CSV for the selected range'}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                        download
                      </span>
                      <span className="truncate">{exportingCsv ? 'Downloading…' : 'Download CSV'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {compareRanges ? (
          <div className="space-y-10">
            {(['today', 'last7', 'last30'] as const).map((key) => {
              const block = (salesData as any)[key]
              return (
                <section key={key} className="space-y-4">
                  <h2 className="text-xl font-semibold text-slate-900">{block.title}</h2>
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
          />
        </div>
      </div>

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
          <div style={{ fontSize: 22, fontWeight: 700 }}>Reports Dashboard</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Generated {format(new Date(), 'yyyy-MM-dd HH:mm')}
          </div>
        </div>

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
      </div>
    </div>
  )
}
