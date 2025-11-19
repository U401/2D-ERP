// GCash transaction types and validation

export type GCashVerificationStatus = 'confirmed' | 'rejected' | null

export type GCashRejectionReason =
  | 'ocr_failed'
  | 'not_gcash'
  | 'missing_datetime'
  | 'missing_reference'
  | 'too_old'
  | 'duplicate_reference'
  | null

export interface GCashTransactionData {
  referenceCode: string
  transactionTimestamp: Date
  extractedConfidence?: number
}

export interface GCashVerificationResult {
  success: boolean
  status: GCashVerificationStatus
  rejectionReason?: GCashRejectionReason
  transactionData?: GCashTransactionData
  error?: string
}

export interface GCashOCRResult {
  text: string
  confidence: number
}

// Helper function to check if text contains GCash-like patterns
export function isGCashLike(text: string): boolean {
  const lowerText = text.toLowerCase()
  
  // Check for GCash keyword
  const hasGCash = lowerText.includes('gcash')
  
  // Check for reference number labels
  const hasReferenceLabel = 
    /\b(reference\s*(?:no|number|#)?|ref\.?\s*(?:no|number|#)?|txn\s*id|transaction\s*id)\b/i.test(text)
  
  // Check for typical receipt phrases
  const hasReceiptPhrases = 
    /\b(you\s+have\s+received|sent\s+money|paid\s+to|transaction\s+successful)\b/i.test(text)
  
  // Need at least 2 of these indicators
  const indicators = [hasGCash, hasReferenceLabel, hasReceiptPhrases].filter(Boolean).length
  
  return indicators >= 2
}

// Extract reference code from OCR text
export function extractReferenceCode(text: string): string | null {
  // Look for patterns like "Reference No: ABC123XYZ" or "Ref. #: 1234567890"
  const patterns = [
    /(?:reference\s*(?:no|number|#)?|ref\.?\s*(?:no|number|#)?|txn\s*id|transaction\s*id)[\s:]*([a-z0-9]{7,20})/i,
    /\b([a-z0-9]{7,20})\b/i, // Fallback: any alphanumeric 7-20 chars
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const code = match[1].trim()
      // Validate length
      if (code.length >= 7 && code.length <= 20) {
        return code.toUpperCase()
      }
    }
  }
  
  return null
}

// Extract date and time from OCR text
export function extractTransactionTimestamp(text: string): Date | null {
  // Common GCash date/time formats - more flexible patterns
  // Try more specific patterns first, then fallback to generic ones
  const patterns = [
    // Full date + time patterns - handle "Nov 19, 2025 3:55PM" (no space) or "Nov 19, 2025 3:55 PM" (with space)
    // "Jan 15, 2024 2:30 PM" or "January 15, 2024 14:30" or "Jan 15 2024 2:30PM" or "Nov 19, 2025 3:55PM"
    /(\w{3,9}\s+\d{1,2},?\s+\d{4}\s+\d{1,2}[:.]\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i,
    // "2024-01-15 14:30" or "2024/01/15 14:30" or "2024.01.15 14:30" or "2024-01-15T14:30"
    /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[T\s]+\d{1,2}[:.]\d{2}(?::\d{2})?)/,
    // "01/15/2024 2:30 PM" or "1/15/2024 14:30" or "01-15-2024 14:30"
    /(\d{1,2}[-/]\d{1,2}[-/]\d{4}\s+\d{1,2}[:.]\d{2}(?::\d{2})?(?:\s*(?:AM|PM|am|pm))?)/i,
    // "15 Jan 2024 14:30" or "15-Jan-2024 14:30"
    /(\d{1,2}[\s-]\w{3,9}[\s-]\d{4}\s+\d{1,2}[:.]\d{2}(?::\d{2})?)/i,
    // "Today 2:30 PM" or "Today 14:30" - use current date
    /(today|now)\s+\d{1,2}[:.]\d{2}(?::\d{2})?(?:\s*(?:AM|PM|am|pm))?/i,
    // Date only patterns - try to find time nearby
    /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/,
    // Time patterns with context (look for time near date keywords)
    /(?:date|time|on|at)[\s:]*(\d{1,2}[:.]\d{2}(?::\d{2})?(?:\s*(?:AM|PM|am|pm))?)/i,
    // Generic time pattern - assume today's date (last resort)
    /\b(\d{1,2}[:.]\d{2}(?::\d{2})?(?:\s*(?:AM|PM|am|pm))?)\b/,
  ]
  
  // Try each pattern
  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i]
    const matches = text.matchAll(new RegExp(pattern.source, pattern.flags + 'g'))
    
    for (const match of matches) {
      if (match && match[1]) {
        try {
          let dateStr = match[1].trim()
          
          // Handle "today" or "now" - replace with current date
          if (/^(today|now)/i.test(dateStr)) {
            const today = new Date()
            const timeMatch = dateStr.match(/(\d{1,2}[:.]\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i)
            if (timeMatch) {
              dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} ${timeMatch[1]}`
            }
          }
          
          // Handle date-only patterns (pattern index 6) - look for time nearby
          if (i === 6) {
            const dateMatch = dateStr
            // Look for time within 50 characters after the date
            const afterDate = text.substring(match.index! + match[0].length, match.index! + match[0].length + 50)
            const timeMatch = afterDate.match(/(\d{1,2}[:.]\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i)
            if (timeMatch) {
              dateStr = `${dateMatch} ${timeMatch[1]}`
            } else {
              // No time found, use current time
              const now = new Date()
              dateStr = `${dateStr} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
            }
          }
          
          // Handle time-only patterns (last 2 patterns) - prepend today's date
          if (i >= 7 && !/\d{4}/.test(dateStr)) {
            const today = new Date()
            dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} ${dateStr}`
          }
          
          // Normalize separators and fix common OCR errors
          // First, ensure AM/PM has a space before it if missing
          dateStr = dateStr.replace(/(\d)(AM|PM|am|pm)/i, '$1 $2')
          
          dateStr = dateStr
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/[Oo](?=\d)/g, '0') // O -> 0 before digits
            .replace(/(?<=\d)[Oo]/g, '0') // O -> 0 after digits
            .replace(/(\d)[Il|](\d)/g, '$11$2') // I/l/| -> 1 between digits
            .replace(/[:.]/g, ':') // Normalize time separator
            .replace(/\s*T\s*/g, ' ') // Normalize ISO T separator
            .trim()
        
          const parsed = new Date(dateStr)
          
          // Validate the parsed date
          if (!isNaN(parsed.getTime())) {
            // Check if date is reasonable (not too far in past/future)
            const now = new Date()
            const tenYearsAgo = new Date(now.getFullYear() - 10, 0, 1)
            const oneYearFromNow = new Date(now.getFullYear() + 1, 11, 31)
            
            if (parsed >= tenYearsAgo && parsed <= oneYearFromNow) {
              console.log(`Extracted timestamp: ${dateStr} -> ${parsed.toISOString()}`)
              return parsed
            }
          }
        } catch (e) {
          // Continue to next pattern
          continue
        }
      }
    }
  }
  
  console.log('No valid timestamp found in OCR text')
  return null
}

// Validate if transaction is within last 10 minutes
export function isTransactionRecent(transactionTime: Date, serverTime: Date = new Date()): boolean {
  const diffMs = serverTime.getTime() - transactionTime.getTime()
  const diffMinutes = diffMs / (1000 * 60)
  return diffMinutes >= 0 && diffMinutes <= 10
}

// Mask reference code for logging (show first 4 + last 2)
export function maskReferenceCode(code: string): string {
  if (code.length <= 6) {
    return '******'
  }
  return `${code.substring(0, 4)}${'*'.repeat(Math.max(0, code.length - 6))}${code.substring(code.length - 2)}`
}



