'use client'

import { useState, useEffect } from 'react'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachWeekOfInterval } from 'date-fns'

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
  startDate,
  endDate,
}: Props) {
  const [periodOffset, setPeriodOffset] = useState(0)

  // Reset period offset when date range changes
  useEffect(() => {
    setPeriodOffset(0)
  }, [startDate, endDate])

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : ''
    return `${sign}${change.toFixed(1)}%`
  }

  const getChangeColor = (change: number) => {
    return change >= 0 ? 'text-green-600' : 'text-red-600'
  }

  // Calculate all available weeks in the date range
  const getAllWeeks = () => {
    if (!startDate || !endDate) return []
    
    // Get all weeks in the date range (full weeks Monday-Sunday)
    const weeks = eachWeekOfInterval(
      { start: startDate, end: endDate },
      { weekStartsOn: 1 } // Start week on Monday
    )
    
    return weeks.map((weekStart) => {
      // Get full week boundaries (Monday to Sunday)
      const weekStartMonday = startOfWeek(weekStart, { weekStartsOn: 1 })
      const weekEndSunday = endOfWeek(weekStart, { weekStartsOn: 1 })
      
      // Only include weeks that have at least 7 days within the date range
      // or are the first/last week (which might be partial)
      const periodStart = weekStartMonday < startDate ? startDate : weekStartMonday
      const periodEnd = weekEndSunday > endDate ? endDate : weekEndSunday
      
      // Calculate days in this period
      const daysInPeriod = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
      
      // Format label for dropdown
      const label = format(periodStart, 'MMM d') + ' - ' + format(periodEnd, 'MMM d')
      
      return {
        start: periodStart,
        end: periodEnd,
        label,
        daysInPeriod,
      }
    }).filter(week => week.daysInPeriod >= 1) // Filter out invalid weeks
  }

  const allWeeks = getAllWeeks()
  const totalPeriods = allWeeks.length
  const currentPeriodIndex = Math.max(0, Math.min(totalPeriods - 1, periodOffset))
  const currentWeek = allWeeks[currentPeriodIndex]
  const periodStart = currentWeek?.start || null
  const periodEnd = currentWeek?.end || null

  // Filter dailySales to only include the current period
  const filteredDailySales = periodStart && periodEnd ? 
    Object.keys(dailySales).reduce((acc, dateKey) => {
      const date = new Date(dateKey)
      if (date >= periodStart && date <= periodEnd) {
        acc[dateKey] = dailySales[dateKey]
      }
      return acc
    }, {} as Record<string, number>) : dailySales

  // Prepare weekday sales data for chart
  const chartData = periodStart && periodEnd ? 
    getWeekdayChartData(filteredDailySales, periodStart, periodEnd) : []

  // Prepare category data for pie chart
  const categoryEntries = Object.entries(categorySales).sort((a, b) => b[1] - a[1])
  const totalCategorySales = Object.values(categorySales).reduce((sum, val) => sum + val, 0)

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="flex flex-1 flex-col gap-1 rounded-xl p-6 bg-white border border-slate-200">
          <p className="text-slate-500 text-sm font-medium">Total Revenue</p>
          <p className="text-2xl font-bold">${totalRevenue.toFixed(2)}</p>
          {revenueChange !== 0 && (
            <p className={`text-sm font-medium ${getChangeColor(revenueChange)}`}>
              {formatChange(revenueChange)}
            </p>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 rounded-xl p-6 bg-white border border-slate-200">
          <p className="text-slate-500 text-sm font-medium">Total Orders</p>
          <p className="text-2xl font-bold">{totalOrders}</p>
          {ordersChange !== 0 && (
            <p className={`text-sm font-medium ${getChangeColor(ordersChange)}`}>
              {formatChange(ordersChange)}
            </p>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 rounded-xl p-6 bg-white border border-slate-200">
          <p className="text-slate-500 text-sm font-medium">Average Order Value</p>
          <p className="text-2xl font-bold">${avgOrderValue.toFixed(2)}</p>
          {avgOrderChange !== 0 && (
            <p className={`text-sm font-medium ${getChangeColor(avgOrderChange)}`}>
              {formatChange(avgOrderChange)}
            </p>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 rounded-xl p-6 bg-white border border-slate-200">
          <p className="text-slate-500 text-sm font-medium">Top Selling Item</p>
          <p className="text-2xl font-bold truncate">{topProductName}</p>
          {topProductChange !== 0 && (
            <p className={`text-sm font-medium ${getChangeColor(topProductChange * 100)}`}>
              {formatChange(topProductChange * 100)} vs last period
            </p>
          )}
        </div>
      </div>

      {/* Sales Over Time Chart and Sales by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
        {/* Sales Over Time Chart */}
        <div className="lg:col-span-3 flex min-w-72 flex-1 flex-col gap-2 rounded-xl border border-slate-200 p-6 bg-white">
          <div className="flex items-center justify-between">
            <p className="text-base font-medium">Sales Over Time</p>
            {totalPeriods > 1 && (
              <div className="relative inline-block text-left">
                <select
                  value={currentPeriodIndex}
                  onChange={(e) => setPeriodOffset(parseInt(e.target.value))}
                  className="appearance-none flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-md h-9 pl-3 pr-8 bg-input-gray text-gray-900 text-sm font-medium border border-gray-300 gap-2 hover:bg-[#E0E0E0] transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  {allWeeks.map((week, index) => (
                    <option key={index} value={index}>
                      {week.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                    expand_more
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold truncate">
              ${chartData.reduce((sum, day) => sum + day.value, 0).toFixed(2)}
            </p>
            {revenueChange !== 0 && (
              <p className={`text-sm font-medium ${getChangeColor(revenueChange)}`}>
                {formatChange(revenueChange)}
              </p>
            )}
          </div>
          {periodStart && periodEnd ? (
            <p className="text-sm font-normal text-slate-500">
              {format(periodStart, 'MMM d')} - {format(periodEnd, 'MMM d')}
            </p>
          ) : startDate && endDate ? (
            <p className="text-sm font-normal text-slate-500">
              {format(startDate, 'MMM d')} - {format(endDate, 'MMM d')}
            </p>
          ) : null}
          <div className="h-64 w-full mt-4">
            {chartData.length > 0 ? (
              <div className="h-full flex items-end justify-between gap-2 px-2">
                {chartData.map((day, index) => {
                  // Calculate bar height as percentage of container height
                  const barHeightPercent = day.percentage
                  return (
                    <div key={index} className="flex flex-col items-center gap-2 flex-1 h-full">
                      <div className="flex-1 w-full flex items-end justify-center relative min-h-0">
                        {day.value > 0 ? (
                          <div
                            className="bg-button-gray w-full rounded-t transition-all hover:bg-[#D0D0D0] cursor-pointer relative group"
                            style={{ 
                              height: `${barHeightPercent}%`,
                              minHeight: '4px'
                            }}
                            title={`${day.label.replace('\n', ' ')}: $${day.value.toFixed(2)}`}
                          >
                            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                              ${day.value.toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <div className="w-full" style={{ height: '2px' }}></div>
                        )}
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        <p className="text-slate-500 text-xs font-medium text-center">
                          {day.label}
                        </p>
                        <p className="text-slate-400 text-xs font-normal text-center">
                          {day.dateNumber !== null ? day.dateNumber : '-'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                No sales data available
              </div>
            )}
          </div>
        </div>

        {/* Sales by Category */}
        <div className="lg:col-span-2 flex min-w-72 flex-1 flex-col gap-4 rounded-xl border border-slate-200 p-6 bg-white">
          <p className="text-base font-medium">Sales by Category</p>
          {categoryEntries.length > 0 ? (
            <>
              <div className="flex items-center justify-center h-full">
                <div className="aspect-square w-48 h-48 rounded-full relative">
                  {generatePieChart(categoryEntries, totalCategorySales)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {categoryEntries.slice(0, 4).map(([category, amount], index) => {
                  const percentage = (amount / totalCategorySales) * 100
                  const colors = [
                    'bg-slate-800',
                    'bg-slate-600',
                    'bg-slate-400',
                    'bg-slate-200',
                  ]
                  return (
                    <div key={category} className="flex items-center gap-2">
                      <div className={`size-3 rounded-full ${colors[index] || 'bg-slate-300'}`}></div>
                      <span className="text-slate-700 truncate">
                        {category} ({percentage.toFixed(0)}%)
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              No category data available
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function getWeekdayChartData(
  dailySales: Record<string, number>,
  startDate: Date,
  endDate: Date
): Array<{ label: string; value: number; percentage: number; dateNumber: number | null }> {
  // Initialize weekday totals (Monday = 1, Tuesday = 2, ..., Sunday = 0)
  const weekdayTotals: Record<number, number> = {
    1: 0, // Monday
    2: 0, // Tuesday
    3: 0, // Wednesday
    4: 0, // Thursday
    5: 0, // Friday
    6: 0, // Saturday
    0: 0, // Sunday
  }
  
  // Calculate the actual date for each weekday in the selected period
  // Find the first occurrence of each weekday within the date range
  const weekdayDates: Record<number, number | null> = {
    1: null, // Monday
    2: null, // Tuesday
    3: null, // Wednesday
    4: null, // Thursday
    5: null, // Friday
    6: null, // Saturday
    0: null, // Sunday
  }
  
  // Find the first occurrence of each weekday in the date range
  const currentDate = new Date(startDate)
  while (currentDate <= endDate) {
    const weekday = currentDate.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    if (weekdayDates[weekday] === null) {
      weekdayDates[weekday] = currentDate.getDate() // Store day of month
    }
    currentDate.setDate(currentDate.getDate() + 1)
  }
  
  // Aggregate sales by weekday across the entire date range
  Object.keys(dailySales).forEach((dateKey) => {
    const date = new Date(dateKey)
    const weekday = date.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    // Include all days Monday (1) through Sunday (0)
    weekdayTotals[weekday] = (weekdayTotals[weekday] || 0) + dailySales[dateKey]
  })
  
  // Weekday labels in order: Mon, Tue, Wed, Thu, Fri, Sat, Sun
  const weekdayLabels: Record<number, string> = {
    1: 'Mon',
    2: 'Tue',
    3: 'Wed',
    4: 'Thu',
    5: 'Fri',
    6: 'Sat',
    0: 'Sun',
  }
  
  // Convert to array format in order: Mon, Tue, Wed, Thu, Fri, Sat, Sun
  const chartData = [1, 2, 3, 4, 5, 6, 0].map((dayIndex) => {
    return {
      label: weekdayLabels[dayIndex],
      value: weekdayTotals[dayIndex] || 0,
      percentage: 0, // Will calculate after we have maxValue
      dateNumber: weekdayDates[dayIndex], // Day of month (1-31) or null
    }
  })
  
  // Calculate max value for percentage calculation
  const maxValue = Math.max(...chartData.map(d => d.value), 1)
  
  // Update percentages and return
  return chartData.map(day => ({
    label: day.label,
    value: day.value,
    percentage: maxValue > 0 ? (day.value / maxValue) * 100 : 0,
    dateNumber: day.dateNumber,
  }))
}

function generatePieChart(
  categoryEntries: Array<[string, number]>,
  total: number
): JSX.Element {
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

