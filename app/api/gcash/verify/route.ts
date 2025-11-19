import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import {
  isGCashLike,
  extractReferenceCode,
  extractTransactionTimestamp,
  isTransactionRecent,
  maskReferenceCode,
  type GCashVerificationResult,
  type GCashRejectionReason,
} from '@/lib/types/gcash'

// Tesseract.js OCR client
// Note: API routes default to Node.js runtime in Next.js 14
async function detectTextWithTesseract(imageBase64: string): Promise<{
  text: string
  confidence: number
}> {
  try {
    // Use require instead of import to avoid Next.js worker script bundling issues
    // This forces Node.js to load tesseract.js as a CommonJS module
    const tesseract = require('tesseract.js')
    const buffer = Buffer.from(imageBase64, 'base64')
    
    // Use recognize directly
    const { data } = await tesseract.recognize(buffer, 'eng', {
      logger: (m: any) => {
        // Suppress verbose logging in production
        if (process.env.NODE_ENV === 'development' && m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`)
        }
      },
    })
    
    const text = data.text || ''
    // Tesseract.js confidence is 0-100, normalize to 0-1
    const confidence = typeof data.confidence === 'number' ? data.confidence / 100 : 0.8

    return {
      text,
      confidence,
    }
  } catch (error) {
    console.error('Tesseract OCR error:', error)
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const imageFile = formData.get('image') as File | null

    if (!imageFile) {
      return NextResponse.json(
        {
          success: false,
          status: 'rejected' as const,
          rejectionReason: 'ocr_failed' as GCashRejectionReason,
          error: 'No image file provided',
        } satisfies GCashVerificationResult,
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(imageFile.type)) {
      return NextResponse.json(
        {
          success: false,
          status: 'rejected' as const,
          rejectionReason: 'ocr_failed' as GCashRejectionReason,
          error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.',
        } satisfies GCashVerificationResult,
        { status: 400 }
      )
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (imageFile.size > maxSize) {
      return NextResponse.json(
        {
          success: false,
          status: 'rejected' as const,
          rejectionReason: 'ocr_failed' as GCashRejectionReason,
          error: 'File size exceeds 10MB limit',
        } satisfies GCashVerificationResult,
        { status: 400 }
      )
    }

    // Convert image to base64
    const arrayBuffer = await imageFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const imageBase64 = buffer.toString('base64')

    // Perform OCR
    let ocrText: string
    let ocrConfidence: number
    
    try {
      const ocrResult = await detectTextWithTesseract(imageBase64)
      ocrText = ocrResult.text
      ocrConfidence = ocrResult.confidence
      
      // Log OCR text for debugging
      console.log('=== OCR Result ===')
      console.log('Confidence:', ocrConfidence)
      console.log('Text length:', ocrText.length)
      console.log('First 1000 chars:', ocrText.substring(0, 1000))
      console.log('==================')
    } catch (error) {
      console.error('OCR failed:', error)
      return NextResponse.json(
        {
          success: false,
          status: 'rejected' as const,
          rejectionReason: 'ocr_failed' as GCashRejectionReason,
          error: error instanceof Error ? error.message : 'OCR processing failed',
        } satisfies GCashVerificationResult,
        { status: 500 }
      )
    }

    // Check if it's a GCash transaction
    if (!isGCashLike(ocrText)) {
      return NextResponse.json(
        {
          success: false,
          status: 'rejected' as const,
          rejectionReason: 'not_gcash' as GCashRejectionReason,
          error: 'Image does not appear to be a GCash transaction',
        } satisfies GCashVerificationResult,
        { status: 200 }
      )
    }

    // Extract reference code
    const referenceCode = extractReferenceCode(ocrText)
    if (!referenceCode) {
      return NextResponse.json(
        {
          success: false,
          status: 'rejected' as const,
          rejectionReason: 'missing_reference' as GCashRejectionReason,
          error: 'Could not extract reference code from transaction',
        } satisfies GCashVerificationResult,
        { status: 200 }
      )
    }

    // Extract transaction timestamp
    const transactionTimestamp = extractTransactionTimestamp(ocrText)
    if (!transactionTimestamp) {
      // Log OCR text for debugging (first 500 chars)
      console.log('OCR text (first 500 chars):', ocrText.substring(0, 500))
      return NextResponse.json(
        {
          success: false,
          status: 'rejected' as const,
          rejectionReason: 'missing_datetime' as GCashRejectionReason,
          error: 'Could not extract transaction date/time. Please ensure the image shows a clear date and time.',
          debug: process.env.NODE_ENV === 'development' ? {
            ocrTextPreview: ocrText.substring(0, 200),
          } : undefined,
        } satisfies GCashVerificationResult,
        { status: 200 }
      )
    }

    // Validate transaction is recent (within 10 minutes)
    const serverTime = new Date()
    if (!isTransactionRecent(transactionTimestamp, serverTime)) {
      return NextResponse.json(
        {
          success: false,
          status: 'rejected' as const,
          rejectionReason: 'too_old' as GCashRejectionReason,
          error: 'Transaction is older than 10 minutes',
          transactionData: {
            referenceCode,
            transactionTimestamp,
            extractedConfidence: ocrConfidence,
          },
        } satisfies GCashVerificationResult,
        { status: 200 }
      )
    }

    // STRICT: Check for duplicate reference code - reject ANY duplicate immediately
    // Check ALL sales regardless of status, timestamp, or any other condition
    const supabase = createServerClient()
    
    const { data: existingSales, error: checkError } = await supabase
      .from('sales')
      .select('id, gcash_reference_code, gcash_transaction_timestamp_utc, gcash_verification_status, sold_at')
      .eq('gcash_reference_code', referenceCode)
      .not('gcash_reference_code', 'is', null) // Only check sales that have a reference code

    if (checkError) {
      console.error('Error checking duplicate:', checkError)
      // Don't continue on database error - fail securely
      return NextResponse.json(
        {
          success: false,
          status: 'rejected' as const,
          rejectionReason: 'ocr_failed' as GCashRejectionReason,
          error: 'Failed to verify reference code. Please try again.',
        } satisfies GCashVerificationResult,
        { status: 500 }
      )
    }

    // STRICT: Reject ANY duplicate reference code immediately, regardless of timestamp or status
    if (existingSales && existingSales.length > 0) {
      const duplicateSale = existingSales[0]
      
      console.log('STRICT DUPLICATE REJECTION - Reference code already exists:', {
        referenceCode,
        existingSaleId: duplicateSale.id,
        existingStatus: duplicateSale.gcash_verification_status,
        existingTimestamp: duplicateSale.gcash_transaction_timestamp_utc,
        existingSoldAt: duplicateSale.sold_at,
        newTimestamp: transactionTimestamp.toISOString(),
      })

      return NextResponse.json(
        {
          success: false,
          status: 'rejected' as const,
          rejectionReason: 'duplicate_reference' as GCashRejectionReason,
          error: `Reference code ${maskReferenceCode(referenceCode)} has already been used. Each GCash transaction can only be used once.`,
          transactionData: {
            referenceCode,
            transactionTimestamp,
            extractedConfidence: ocrConfidence,
          },
        } satisfies GCashVerificationResult,
        { status: 200 }
      )
    }

    // All checks passed - transaction is valid
    return NextResponse.json(
      {
        success: true,
        status: 'confirmed' as const,
        transactionData: {
          referenceCode,
          transactionTimestamp,
          extractedConfidence: ocrConfidence,
        },
      } satisfies GCashVerificationResult,
      { status: 200 }
    )
  } catch (error) {
    console.error('GCash verification error:', error)
    return NextResponse.json(
      {
        success: false,
        status: 'rejected' as const,
        rejectionReason: 'ocr_failed' as GCashRejectionReason,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      } satisfies GCashVerificationResult,
      { status: 500 }
    )
  }
}



