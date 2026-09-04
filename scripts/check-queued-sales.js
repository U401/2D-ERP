// Script to check for queued sales in the service worker's Background Sync queue
// Queued sales are stored in IndexedDB by Workbox

// This script can be run in the browser console or as a Node.js script
// For browser: Copy and paste into browser console on the POS page
// For Node.js: Run with `node scripts/check-queued-sales.js`

async function checkQueuedSales() {
  if (typeof window === 'undefined') {
    console.log('This script must be run in a browser environment')
    console.log('To check queued sales:')
    console.log('1. Open your browser DevTools (F12)')
    console.log('2. Go to the Application tab')
    console.log('3. Click on IndexedDB in the left sidebar')
    console.log('4. Look for "workbox-background-sync" database')
    console.log('5. Check the "requests" object store for entries with queueName = "pos-sales-queue"')
    return
  }

  try {
    // Check if service worker is registered
    if (!('serviceWorker' in navigator)) {
      console.log('❌ Service Worker is not supported in this browser')
      return
    }

    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) {
      console.log('❌ No service worker registered')
      return
    }

    console.log('✅ Service Worker is registered')

    // Check Background Sync API
    if (!('sync' in registration)) {
      console.log('❌ Background Sync API is not available')
      console.log('Note: Background Sync requires HTTPS (or localhost)')
      return
    }

    // Check IndexedDB for Workbox Background Sync queue
    const dbName = 'workbox-background-sync'
    const request = indexedDB.open(dbName)

    request.onsuccess = (event) => {
      const db = event.target.result
      
      // Check if 'requests' object store exists
      if (!db.objectStoreNames.contains('requests')) {
        console.log('❌ No queued sales found (requests object store does not exist)')
        db.close()
        return
      }

      const transaction = db.transaction(['requests'], 'readonly')
      const store = transaction.objectStore('requests')
      const getAllRequest = store.getAll()

      getAllRequest.onsuccess = () => {
        const requests = getAllRequest.result
        const queuedSales = requests.filter(req => {
          // Check if this is a request to /api/pos/finalize
          try {
            const requestData = req.requestData
            if (requestData && requestData.url) {
              return requestData.url.includes('/api/pos/finalize')
            }
            return false
          } catch (e) {
            return false
          }
        })

        if (queuedSales.length === 0) {
          console.log('✅ No queued sales found')
        } else {
          console.log(`⚠️ Found ${queuedSales.length} queued sale(s):`)
          queuedSales.forEach((sale, index) => {
            console.log(`\nSale ${index + 1}:`)
            console.log('  Queue Name:', sale.queueName)
            console.log('  Timestamp:', new Date(sale.timestamp).toLocaleString())
            console.log('  Request URL:', sale.requestData?.url)
            try {
              const body = JSON.parse(sale.requestData?.body || '{}')
              console.log('  Session ID:', body.sessionId)
              console.log('  Payment Method:', body.paymentMethod)
              console.log('  Items Count:', body.items?.length || 0)
              if (body.items) {
                console.log('  Items:', body.items.map(i => `${i.quantity}x ${i.product_id}`).join(', '))
              }
            } catch (e) {
              console.log('  (Could not parse request body)')
            }
          })
        }
        db.close()
      }

      getAllRequest.onerror = () => {
        console.log('❌ Error reading queued sales from IndexedDB')
        db.close()
      }
    }

    request.onerror = () => {
      console.log('❌ Could not access IndexedDB')
      console.log('This might mean:')
      console.log('  - No sales have been queued yet')
      console.log('  - IndexedDB is not accessible')
    }

    // Also check Background Sync registration
    const tags = await registration.sync.getTags()
    if (tags.includes('pos-sales-queue')) {
      console.log('✅ Background Sync tag "pos-sales-queue" is registered')
    } else {
      console.log('ℹ️ No active Background Sync tag found')
    }

  } catch (error) {
    console.error('Error checking queued sales:', error)
  }
}

// Run the check
if (typeof window !== 'undefined') {
  checkQueuedSales()
} else {
  console.log(`
To check for queued sales in the browser:

1. Open your browser DevTools (F12)
2. Go to the Application tab (Chrome) or Storage tab (Firefox)
3. Click on IndexedDB in the left sidebar
4. Look for "workbox-background-sync" database
5. Expand it and click on "requests" object store
6. Look for entries where queueName = "pos-sales-queue"

Alternatively, paste this code into the browser console on the POS page:
${checkQueuedSales.toString()}
checkQueuedSales()
  `)
}















