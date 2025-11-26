# How to Check for Queued Sales

## Overview

Queued sales are sales that were attempted while offline. They are stored in the browser's IndexedDB by the Service Worker's Background Sync feature and will automatically sync when the connection is restored.

## Method 1: Check via POS Page (Automatic)

The POS page now automatically checks for queued sales and displays a yellow banner if any are found:

- **Location**: Top of the cart sidebar on the POS page (`/pos`)
- **Indicator**: Yellow banner showing "X sale(s) queued"
- **Refresh**: Click the "Refresh" button to manually check again
- **Auto-check**: Checks every 30 seconds automatically

## Method 2: Browser DevTools (Manual)

1. Open your browser DevTools (F12)
2. Go to the **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Click on **IndexedDB** in the left sidebar
4. Look for **"workbox-background-sync"** database
5. Expand it and click on **"requests"** object store
6. Look for entries where `queueName = "pos-sales-queue"`

## Method 3: Browser Console (Quick Check)

1. Open the POS page (`/pos`)
2. Open Browser Console (F12 → Console tab)
3. Paste and run this code:

```javascript
async function checkQueuedSales() {
  try {
    const dbName = 'workbox-background-sync'
    const request = indexedDB.open(dbName)
    
    request.onsuccess = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains('requests')) {
        console.log('✅ No queued sales found')
        db.close()
        return
      }
      
      const transaction = db.transaction(['requests'], 'readonly')
      const store = transaction.objectStore('requests')
      const getAllRequest = store.getAll()
      
      getAllRequest.onsuccess = () => {
        const requests = getAllRequest.result
        const queuedSales = requests.filter(req => {
          try {
            return req.requestData?.url?.includes('/api/pos/finalize')
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
            console.log('  Timestamp:', new Date(sale.timestamp).toLocaleString())
            try {
              const body = JSON.parse(sale.requestData?.body || '{}')
              console.log('  Session ID:', body.sessionId)
              console.log('  Payment Method:', body.paymentMethod)
              console.log('  Items Count:', body.items?.length || 0)
            } catch (e) {
              console.log('  (Could not parse request body)')
            }
          })
        }
        db.close()
      }
    }
    
    request.onerror = () => {
      console.log('❌ Could not access IndexedDB (no queued sales)')
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

checkQueuedSales()
```

## Method 4: Use the Utility Script

Run the Node.js script (for documentation only - actual checking requires browser):

```bash
node scripts/check-queued-sales.js
```

This will show instructions for browser-based checking.

## What Happens to Queued Sales?

1. **When Offline**: Sales are queued in IndexedDB automatically
2. **When Online**: Service Worker automatically syncs queued sales
3. **After Sync**: Sales are processed and removed from the queue
4. **Retention**: Queued sales are kept for up to 24 hours

## Troubleshooting

### No Queued Sales Showing?

- **Check Service Worker**: Ensure service worker is registered (check Application tab → Service Workers)
- **Check Background Sync**: Background Sync requires HTTPS (or localhost)
- **Check Network**: If online, sales sync immediately and won't be queued
- **Check Browser**: Some browsers may not support Background Sync

### Queued Sales Not Syncing?

- **Check Connection**: Ensure you're online
- **Check Service Worker**: Service Worker must be active
- **Manual Sync**: Try refreshing the page or restarting the browser
- **Check Console**: Look for errors in the browser console

## Notes

- Queued sales are **browser-specific** (stored locally in IndexedDB)
- Queued sales are **not** stored in the database until synced
- GCash payments **cannot** be queued (require online connection)
- Only Cash and Card payments can be queued when offline

