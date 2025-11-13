import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { startOfDay, endOfDay, subDays } from 'date-fns'

export async function GET(request: Request) {
  const supabase = createServerClient()
  const { searchParams } = new URL(request.url)
  const dateRange = searchParams.get('range') || 'last30days'

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

  // Get sales with items and product details
  const { data: sales, error } = await supabase
    .from('sales')
    .select(
      `
      id,
      total_amount,
      sold_at,
      payment_method,
      sale_items (
        product_id,
        quantity,
        price,
        products (
          name,
          category
        )
      )
    `
    )
    .gte('sold_at', startDate.toISOString())
    .lte('sold_at', endDate.toISOString())
    .order('sold_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build CSV
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

  sales?.forEach((sale) => {
    const saleDate = new Date(sale.sold_at)
    const dateStr = saleDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const timeStr = saleDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    const saleItems = (sale.sale_items as any[]) || []
    const saleTotal = parseFloat(sale.total_amount.toString())

    if (saleItems.length === 0) {
      // If no items, still include the sale
      rows.push([
        sale.id.slice(0, 8),
        dateStr,
        timeStr,
        sale.payment_method || 'N/A',
        '',
        '',
        '',
        '',
        '',
        `$${saleTotal.toFixed(2)}`,
      ])
    } else {
      saleItems.forEach((item: any, index: number) => {
        const product = item.products || {}
        const unitPrice = parseFloat(item.price.toString())
        const lineTotal = unitPrice * item.quantity

        rows.push([
          index === 0 ? sale.id.slice(0, 8) : '', // Only show sale ID on first row
          index === 0 ? dateStr : '',
          index === 0 ? timeStr : '',
          index === 0 ? (sale.payment_method || 'N/A') : '',
          product.name || 'N/A',
          product.category || 'N/A',
          item.quantity.toString(),
          `$${unitPrice.toFixed(2)}`,
          `$${lineTotal.toFixed(2)}`,
          index === 0 ? `$${saleTotal.toFixed(2)}` : '', // Only show total on first row
        ])
      })
    }
  })

  const csv = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join(
    '\n'
  )

  const filename = `sales-report-${dateRange}-${endDate.toISOString().split('T')[0]}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

