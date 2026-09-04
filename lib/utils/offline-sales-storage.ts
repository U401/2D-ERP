// Fallback storage for offline sales using localStorage
// This ensures sales are stored even if Background Sync doesn't work

export interface OfflineSale {
  id: string
  timestamp: number
  sessionId: string
  paymentMethod: string
  items: Array<{
    product_id: string
    quantity: number
    unit_price: number
  }>
}

const STORAGE_KEY = 'offline_sales_queue'

/**
 * Store an offline sale in localStorage
 */
export function storeOfflineSale(sale: Omit<OfflineSale, 'id' | 'timestamp'>): string {
  const offlineSale: OfflineSale = {
    ...sale,
    id: `offline_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    timestamp: Date.now(),
  }

  const existing = getOfflineSales()
  existing.push(offlineSale)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
  
  console.log('✅ Stored offline sale in localStorage:', offlineSale.id)
  return offlineSale.id
}

/**
 * Get all offline sales from localStorage
 */
export function getOfflineSales(): OfflineSale[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored)
  } catch (error) {
    console.error('Error reading offline sales from localStorage:', error)
    return []
  }
}

/**
 * Remove an offline sale from localStorage
 */
export function removeOfflineSale(saleId: string): void {
  const sales = getOfflineSales()
  const filtered = sales.filter(s => s.id !== saleId)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  console.log('Removed offline sale from localStorage:', saleId)
}

/**
 * Clear all offline sales
 */
export function clearOfflineSales(): void {
  localStorage.removeItem(STORAGE_KEY)
  console.log('Cleared all offline sales from localStorage')
}

/**
 * Get count of offline sales
 */
export function getOfflineSalesCount(): number {
  return getOfflineSales().length
}















