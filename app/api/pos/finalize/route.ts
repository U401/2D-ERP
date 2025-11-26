import { NextRequest, NextResponse } from 'next/server'
import { finalizeSale } from '@/app/actions/sales'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, items, paymentMethod, gcashData } = body

    // Validate required fields
    if (!sessionId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: sessionId and items' },
        { status: 400 }
      )
    }

    // Reject GCash payments if client is offline (though client should prevent this)
    if (paymentMethod === 'gcash' && !gcashData) {
      return NextResponse.json(
        { success: false, error: 'GCash payments require GCash data' },
        { status: 400 }
      )
    }

    // Call the existing server action
    const result = await finalizeSale(
      sessionId,
      items,
      paymentMethod || 'cash',
      gcashData ? {
        referenceCode: gcashData.referenceCode,
        transactionTimestamp: gcashData.transactionTimestamp ? new Date(gcashData.transactionTimestamp) : new Date(),
        imageUrl: gcashData.imageUrl || null,
      } : undefined
    )

    if (result.success) {
      return NextResponse.json({ success: true, saleId: result.saleId })
    } else {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to finalize sale' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error in /api/pos/finalize:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


