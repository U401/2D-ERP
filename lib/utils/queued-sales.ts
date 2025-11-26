// Utility functions to check for queued sales in the service worker's Background Sync queue
import { getOfflineSales, type OfflineSale as LocalOfflineSale } from '@/lib/utils/offline-sales-storage'

export interface QueuedSale {
  id: string
  timestamp: number
  sessionId: string
  paymentMethod: string
  items: Array<{
    product_id: string
    quantity: number
    unit_price: number
  }>
  url?: string
  source?: 'background-sync' | 'localStorage'
}

/**
 * Check for queued sales in the service worker's Background Sync queue
 * Returns an array of queued sales
 */
export async function checkQueuedSales(): Promise<QueuedSale[]> {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    // Check if service worker is registered
    if (!('serviceWorker' in navigator)) {
      return []
    }

    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) {
      return []
    }

    // Check IndexedDB for Workbox Background Sync queue
    const dbName = 'workbox-background-sync'
    
    return new Promise((resolve) => {
      const request = indexedDB.open(dbName)

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        // Check if 'requests' object store exists
        // Workbox creates this only when a request is queued
        if (!db.objectStoreNames.contains('requests')) {
          console.log('IndexedDB: requests object store does not exist - Workbox Background Sync not initialized yet')
          console.log('This is normal if no requests have been queued. The database will be created when the first request fails.')
          db.close()
          
          // Still check localStorage for offline sales
          const localSales = getOfflineSales()
          const localQueuedSales: QueuedSale[] = localSales.map(sale => ({
            id: sale.id,
            timestamp: sale.timestamp,
            sessionId: sale.sessionId,
            paymentMethod: sale.paymentMethod,
            items: sale.items,
            source: 'localStorage'
          }))
          console.log(`Found ${localQueuedSales.length} offline sales in localStorage (no Background Sync queue found)`)
          resolve(localQueuedSales)
          return
        }

        const transaction = db.transaction(['requests'], 'readonly')
        const store = transaction.objectStore('requests')
        const getAllRequest = store.getAll()

        getAllRequest.onsuccess = () => {
          const requests = getAllRequest.result as any[]
          console.log(`IndexedDB: Found ${requests.length} total requests in queue`)
          console.log('All requests:', requests.map(r => ({
            id: r.id,
            timestamp: r.timestamp,
            queueName: r.queueName,
            url: r.requestData?.url,
            method: r.requestData?.method
          })))
          
          const queuedSales: QueuedSale[] = []

          requests.forEach((req) => {
            // Check if this is a request to /api/pos/finalize
            try {
              const requestData = req.requestData
              console.log('Checking request:', {
                url: requestData?.url,
                method: requestData?.method,
                hasBody: !!requestData?.body
              })
              
              if (requestData && requestData.url && requestData.url.includes('/api/pos/finalize')) {
                let body = {}
                try {
                  body = JSON.parse(requestData.body || '{}')
                } catch (parseError) {
                  console.warn('Could not parse request body:', parseError)
                  // Try to extract body from request if it's a Request object
                  if (requestData.body && typeof requestData.body === 'string') {
                    try {
                      body = JSON.parse(requestData.body)
                    } catch (e) {
                      console.warn('Failed to parse body string:', e)
                    }
                  }
                }
                
                queuedSales.push({
                  id: req.id || req.timestamp?.toString() || Math.random().toString(),
                  timestamp: req.timestamp || Date.now(),
                  sessionId: (body as any).sessionId || '',
                  paymentMethod: (body as any).paymentMethod || 'cash',
                  items: (body as any).items || [],
                  url: requestData.url,
                })
              }
            } catch (e) {
              console.warn('Error parsing queued sale request:', e, req)
              // Skip invalid entries
            }
          })

          console.log(`IndexedDB: Found ${queuedSales.length} queued sales for /api/pos/finalize`)
          
          // Add source indicator
          queuedSales.forEach(sale => {
            sale.source = 'background-sync'
          })
          
          db.close()
          
          // Also get localStorage sales
          const localSales = getOfflineSales()
          const localQueuedSales: QueuedSale[] = localSales.map(sale => ({
            id: sale.id,
            timestamp: sale.timestamp,
            sessionId: sale.sessionId,
            paymentMethod: sale.paymentMethod,
            items: sale.items,
            source: 'localStorage'
          }))
          
          // Deduplicate: Check if localStorage sales match Background Sync sales
          // A sale is considered duplicate if it has the same sessionId, items, and timestamp within 5 seconds
          const deduplicatedLocalSales: QueuedSale[] = []
          
          for (const localSale of localQueuedSales) {
            const isDuplicate = queuedSales.some(bgSale => {
              // Check if same session
              if (bgSale.sessionId !== localSale.sessionId) return false
              
              // Check if same items (compare by product_id and quantity)
              if (bgSale.items.length !== localSale.items.length) return false
              
              const bgItemsSorted = [...bgSale.items].sort((a, b) => a.product_id.localeCompare(b.product_id))
              const localItemsSorted = [...localSale.items].sort((a, b) => a.product_id.localeCompare(b.product_id))
              
              const itemsMatch = bgItemsSorted.every((bgItem, idx) => {
                const localItem = localItemsSorted[idx]
                return bgItem.product_id === localItem.product_id && 
                       bgItem.quantity === localItem.quantity
              })
              
              if (!itemsMatch) return false
              
              // Check if timestamp is within 5 seconds (same sale)
              const timeDiff = Math.abs(bgSale.timestamp - localSale.timestamp)
              return timeDiff < 5000
            })
            
            if (!isDuplicate) {
              deduplicatedLocalSales.push(localSale)
            }
          }
          
          // Combine both sources (only non-duplicate localStorage sales)
          const allSales = [...queuedSales, ...deduplicatedLocalSales]
          console.log(`Total queued sales: ${allSales.length} (${queuedSales.length} Background Sync + ${deduplicatedLocalSales.length} localStorage, ${localQueuedSales.length - deduplicatedLocalSales.length} duplicates removed)`)
          resolve(allSales)
        }

        getAllRequest.onerror = (error) => {
          console.error('IndexedDB: Error reading requests:', error)
          db.close()
          resolve([])
        }
      }

      request.onerror = (error) => {
        console.log('IndexedDB: Could not open database:', error)
        console.log('This is normal if Workbox Background Sync hasn\'t created the database yet.')
        console.log('The database will be created automatically when the first request is queued.')
        resolve([])
      }

      request.onupgradeneeded = (event) => {
        // Database doesn't exist yet - Workbox will create it when needed
        console.log('IndexedDB: Database upgrade needed - Workbox will create it when first request is queued')
        const db = (event.target as IDBOpenDBRequest).result
        // Don't create the store ourselves - let Workbox handle it
        resolve([])
      }
    })
  } catch (error) {
    console.error('Error checking queued sales:', error)
    return []
  }
}

/**
 * Get the count of queued sales
 */
export async function getQueuedSalesCount(): Promise<number> {
  const queuedSales = await checkQueuedSales()
  return queuedSales.length
}

