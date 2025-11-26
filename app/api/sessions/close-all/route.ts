import { NextResponse } from 'next/server'
import { closeAllSessions } from '@/app/actions/session'

export async function POST() {
  try {
    const result = await closeAllSessions()
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Successfully closed ${result.closedCount} session(s)`,
        closedCount: result.closedCount
      })
    } else {
      return NextResponse.json({
        success: false,
        message: result.error || 'Failed to close sessions',
        error: result.error
      }, { status: 500 })
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      error: error.message
    }, { status: 500 })
  }
}


