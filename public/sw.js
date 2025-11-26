// Service Worker for offline POS sales queueing
// Uses Workbox Background Sync to queue failed requests and replay when online

importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js')

// Ensure Workbox is loaded
if (workbox) {
  console.log('Workbox loaded successfully')

  // Configure Background Sync for POS finalize endpoint
  const bgSyncPlugin = new workbox.backgroundSync.BackgroundSyncPlugin('pos-sales-queue', {
    maxRetentionTime: 24 * 60, // 24 hours in minutes
  })

  // CRITICAL: Set default handler to NetworkFirst for all routes
  // This ensures requests pass through normally unless explicitly intercepted
  workbox.routing.setDefaultHandler(new workbox.strategies.NetworkFirst())

  // Custom fetch wrapper that treats 500 errors as failures when offline
  const customFetch = async (request) => {
    try {
      const response = await fetch(request)
      
      // If we got a 500+ error and we're offline, treat it as a network failure
      // Background Sync only queues network failures, not HTTP error responses
      if (response.status >= 500 && !navigator.onLine) {
        console.log('⚠️ Got server error while offline - treating as network failure to queue')
        throw new Error(`Server error ${response.status} while offline`)
      }
      
      return response
    } catch (error) {
      console.log('❌ Request failed:', {
        url: request.url,
        method: request.method,
        error: error?.message,
        online: navigator.onLine
      })
      throw error
    }
  }

  // Create NetworkOnly strategy with Background Sync plugin
  const networkOnlyStrategy = new workbox.strategies.NetworkOnly({
    plugins: [
      bgSyncPlugin,
      {
        fetchDidFail: async ({ request, error }) => {
          console.log('✅ Request queued by Background Sync:', request.url)
        },
        requestWillReplay: async ({ request }) => {
          console.log('🔄 Replaying queued request:', request.url)
        }
      }
    ]
  })

  // Override the fetch method used by the strategy
  const originalHandle = networkOnlyStrategy.handle.bind(networkOnlyStrategy)
  networkOnlyStrategy.handle = async (params) => {
    // Replace fetch with our custom fetch that checks response status
    const originalFetch = self.fetch
    self.fetch = customFetch
    
    try {
      const response = await originalHandle(params)
      return response
    } finally {
      // Restore original fetch
      self.fetch = originalFetch
    }
  }

  // Register route for POST requests to /api/pos/finalize
  workbox.routing.registerRoute(
    ({ url, request }) => {
      // Very strict check: only intercept POST to our exact API endpoint on same origin
      const isSameOrigin = url.origin === self.location.origin
      const isExactRoute = url.pathname === '/api/pos/finalize'
      const isPost = request.method === 'POST'
      
      const shouldIntercept = isSameOrigin && isExactRoute && isPost
      
      if (shouldIntercept) {
        console.log('🔵 Service Worker intercepting:', url.pathname, {
          online: navigator.onLine,
          method: request.method,
          url: url.href
        })
      }
      
      return shouldIntercept
    },
    networkOnlyStrategy,
    'POST'
  )

  // Listen for sync events to notify clients when sales are synced
  self.addEventListener('sync', (event) => {
    console.log('Background Sync event:', event.tag)
    if (event.tag === 'pos-sales-queue') {
      event.waitUntil(
        (async () => {
          try {
            console.log('Processing queued sales sync...')
            // Wait a bit to ensure sync completes
            await new Promise(resolve => setTimeout(resolve, 1000))
            
            // Notify all clients that sales have been synced
            const clients = await self.clients.matchAll()
            console.log(`Notifying ${clients.length} client(s) of sync completion`)
            clients.forEach((client) => {
              client.postMessage({
                type: 'sales-synced',
                timestamp: Date.now(),
              })
            })
          } catch (error) {
            console.error('Error notifying clients of sync:', error)
          }
        })()
      )
    }
  })

  // Listen for online events to trigger sync
  self.addEventListener('online', () => {
    console.log('Service Worker: Back online, checking for queued sales...')
    // Background Sync will automatically retry when online
    // But we can also manually trigger if needed
  })

  // Handle messages from clients
  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting()
    }
  })
} else {
  console.error('Workbox could not be loaded')
}
