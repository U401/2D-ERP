'use client'

import type { ReactElement } from 'react'
import { format, addDays, startOfDay } from 'date-fns'
import LineChart, { type LinePoint } from '@/components/LineChart'

type Props = {
  totalRevenue: number
  totalOrders: number
  avgOrderValue: number
  topProductName: string
  revenueChange?: number
  ordersChange?: number
  avgOrderChange?: number
  topProductChange?: number
  categorySales?: Record<string, number>
  dailySales?: Record<string, number>
  /** Optional: provide an explicit series (e.g., hourly points for Today). */
  series?: LinePoint[]
  /** Optional: only show every Nth label on the x-axis (still plots all points). */
  labelEvery?: number
  /** Optional: control chart width (useful for PDF export so it doesn't scroll/clip). */
  chartMinWidthPx?: number
  /** Optional: allow horizontal scrolling for wide charts (default true). */
  chartScrollable?: boolean
  startDate?: Date
  endDate?: Date
}

export default function ReportsSummary({
  totalRevenue,
  totalOrders,
  avgOrderValue,
  topProductName,
  revenueChange = 0,
  ordersChange = 0,
  avgOrderChange = 0,
  topProductChange = 0,
  categorySales = {},
  dailySales = {},
  series,
  labelEvery = 1,
  chartMinWidthPx,
  chartScrollable = true,
  startDate,
  endDate,
}: Props) {
  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : ''
    return `${sign}${change.toFixed(1)}%`
  }

  const getChangeColor = (change: number) => {
    return change >= 0 ? 'text-green-600' : 'text-red-600'
  }

  const computedSeries: LinePoint[] =
    series ??
    (startDate && endDate
      ? buildDailySeries(dailySales, startDate, endDate)
      : Object.keys(dailySales)
          .sort()
          .map((k) => ({ label: k, value: dailySales[k] ?? 0 })))

  // Prepare category data for pie chart
  const categoryEntries = Object.entries(categorySales).sort((a, b) => b[1] - a[1])
  const totalCategorySales = Object.values(categorySales).reduce((sum, val) => sum + val, 0)

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-8 mb-6 sm:mb-10">
        <div className="flex flex-1 flex-col gap-2 rounded-xl p-6 sm:p-8 bg-white border border-slate-200">
          <p className="text-slate-500 text-base font-semibold">Total Revenue</p>
          <p className="text-2xl sm:text-4xl font-bold">₱{totalRevenue.toFixed(2)}</p>
          {revenueChange !== 0 && (
            <p className={`text-base font-semibold ${getChangeColor(revenueChange)}`}>
              {formatChange(revenueChange)}
            </p>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 rounded-xl p-6 sm:p-8 bg-white border border-slate-200">
          <p className="text-slate-500 text-base font-semibold">Total Orders</p>
          <p className="text-2xl sm:text-4xl font-bold">{totalOrders}</p>
          {ordersChange !== 0 && (
            <p className={`text-base font-semibold ${getChangeColor(ordersChange)}`}>
              {formatChange(ordersChange)}
            </p>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 rounded-xl p-6 sm:p-8 bg-white border border-slate-200">
          <p className="text-slate-500 text-base font-semibold">Average Order Value</p>
          <p className="text-2xl sm:text-4xl font-bold">₱{avgOrderValue.toFixed(2)}</p>
          {avgOrderChange !== 0 && (
            <p className={`text-base font-semibold ${getChangeColor(avgOrderChange)}`}>
              {formatChange(avgOrderChange)}
            </p>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 rounded-xl p-6 sm:p-8 bg-white border border-slate-200">
          <p className="text-slate-500 text-base font-semibold">Top Selling Item</p>
          <p className="text-2xl sm:text-4xl font-bold truncate">{topProductName}</p>
          {topProductChange !== 0 && (
            <p className={`text-base font-semibold ${getChangeColor(topProductChange * 100)}`}>
              {formatChange(topProductChange * 100)} vs last period
            </p>
          )}
        </div>
      </div>

      {/* Sales Over Time Chart and Sales by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-8 mb-6 sm:mb-10">
        {/* Sales Over Time Chart */}
        <div className="lg:col-span-3 flex min-w-72 flex-1 flex-col gap-3 rounded-xl border border-slate-200 p-6 sm:p-8 bg-white min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold">Sales Over Time</p>
          </div>
          <div className="flex items-baseline gap-3">
            <p className="text-3xl sm:text-4xl font-bold truncate">
              ₱{computedSeries.reduce((sum, p) => sum + p.value, 0).toFixed(2)}
            </p>
            {revenueChange !== 0 && (
              <p className={`text-base font-semibold ${getChangeColor(revenueChange)}`}>
                {formatChange(revenueChange)}
              </p>
            )}
          </div>
          {startDate && endDate ? (
            <p className="text-base font-normal text-slate-500">
              {format(startDate, 'MMM d')} - {format(endDate, 'MMM d')}
            </p>
          ) : null}
          <div className={`w-full mt-6 ${chartScrollable ? 'overflow-x-auto' : ''}`}>
            <div className="min-w-full">
              <LineChart
                points={computedSeries}
                labelEvery={labelEvery}
                minWidthPx={chartMinWidthPx ?? Math.max(320, computedSeries.length * 40)}
              />
            </div>
          </div>
        </div>

        {/* Sales by Category */}
        <div className="lg:col-span-2 flex min-w-72 flex-1 flex-col gap-5 rounded-xl border border-slate-200 p-6 sm:p-8 bg-white min-w-0">
          <p className="text-lg font-semibold">Sales by Category</p>
          {categoryEntries.length > 0 ? (
            <>
              <div className="flex items-center justify-center h-full">
                <div className="aspect-square w-40 h-40 sm:w-52 sm:h-52 rounded-full relative">
                  {generatePieChart(categoryEntries, totalCategorySales)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-3 text-base">
                {categoryEntries.slice(0, 4).map(([category, amount], index) => {
                  const percentage = (amount / totalCategorySales) * 100
                  const colors = [
                    'bg-slate-800',
                    'bg-slate-600',
                    'bg-slate-400',
                    'bg-slate-200',
                  ]
                  return (
                    <div key={category} className="flex items-center gap-3">
                      <div className={`size-4 rounded-full ${colors[index] || 'bg-slate-300'}`}></div>
                      <span className="text-slate-700 truncate">
                        {category} ({percentage.toFixed(0)}%)
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 text-base">
              No category data available
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function buildDailySeries(
  dailySales: Record<string, number>,
  startDate: Date,
  endDate: Date
): LinePoint[] {
  const start = startOfDay(startDate)
  const end = startOfDay(endDate)

  const out: LinePoint[] = []
  let d = new Date(start)
  while (d <= end) {
    const key = format(d, 'yyyy-MM-dd')
    out.push({
      label: format(d, 'MMM d'),
      value: dailySales[key] ?? 0,
    })
    d = addDays(d, 1)
  }

  return out
}

function generatePieChart(
  categoryEntries: Array<[string, number]>,
  total: number
): ReactElement {
  if (categoryEntries.length === 0) return <></>

  let currentPercent = 0
  const colors = ['rgb(30, 41, 59)', 'rgb(71, 85, 105)', 'rgb(148, 163, 184)', 'rgb(226, 232, 240)']

  const segments = categoryEntries.slice(0, 4).map(([category, amount], index) => {
    const percentage = (amount / total) * 100
    const startPercent = currentPercent
    currentPercent += percentage
    const endPercent = currentPercent

    return {
      color: colors[index] || 'rgb(203, 213, 225)',
      start: startPercent,
      end: endPercent,
    }
  })

  const conicGradient = segments
    .map((seg) => `${seg.color} ${seg.start}% ${seg.end}%`)
    .join(', ')

  return (
    <div
      className="w-full h-full rounded-full"
      style={{ background: `conic-gradient(${conicGradient})` }}
    ></div>
  )
}

