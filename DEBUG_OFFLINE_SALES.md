# Debugging Offline Sales Sync Issues

## Problem
Sales made offline are queued but don't sync when coming back online.

## Quick Fixes

### 1. Manual Sync Button
- On the POS page, click the **"🔄 Sync Queued Sales"** button below the session status
- This manually triggers Background Sync
- Check console for logs

### 2. Check Service Worker Status
Open browser console (F12) and run:
```javascript
navigator.serviceWorker.getRegistration().then(reg => {
  console.log('Service Worker:', reg ? 'Registered' : 'Not registered')
  if (reg) {
    console.log('Active:', reg.active ? 'Yes' : 'No')
    console.log('Waiting:', reg.waiting ? 'Yes' : 'No')
    console.log('Installing:', reg.installing ? 'Yes' : 'No')
  }
})
```

### 3. Check Queued Sales
Open browser console and run:
```javascript
// Check IndexedDB for queued sales
const dbName = 'workbox-background-sync'
const request = indexedDB.open(dbName)
request.onsuccess = (e) => {
  const db = e.target.result
  if (db.objectStoreNames.contains('requests')) {
    const tx = db.transaction(['requests'], 'readonly')
    const store = tx.objectStore('requests')
    store.getAll().onsuccess = (e) => {
      const requests = e.target.result
      const queued = requests.filter(r => r.requestData?.url?.includes('/api/pos/finalize'))
      console.log(`Found ${queued.length} queued sales:`, queued)
    }
  }
}
```

### 4. Manually Trigger Sync
Open browser console and run:
```javascript
navigator.serviceWorker.getRegistration().then(async (reg) => {
  if (reg && 'sync' in reg) {
    try {
      await reg.sync.register('pos-sales-queue')
      console.log('Sync registered successfully')
    } catch (e) {
      console.error('Sync error:', e)
    }
  }
})
```

## Common Issues

### Issue 1: Service Worker Not Active
**Symptoms:** No queued sales, no sync happening

**Fix:**
1. Go to DevTools → Application → Service Workers
2. Click "Unregister" on any old service workers
3. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
4. Check that service worker is "activated and is running"

### Issue 2: Background Sync Not Available
**Symptoms:** Error when trying to register sync

**Fix:**
- Background Sync requires HTTPS (or localhost)
- Make sure you're not using HTTP on a remote server
- Check browser support (Chrome/Edge support it, Firefox/Safari may not)

### Issue 3: Sync Not Triggering Automatically
**Symptoms:** Sales queued but don't sync when coming online

**Fix:**
1. Click the "🔄 Sync Queued Sales" button manually
2. Or run the manual sync code above in console
3. Background Sync may take a few seconds to trigger

### Issue 4: Sales Not Appearing After Sync
**Symptoms:** Sync completes but sales don't show in history

**Fix:**
1. Check browser console for errors
2. Check Network tab to see if requests are being sent
3. Refresh the page after sync completes
4. Check Supabase logs for errors

## Testing Offline Sales

1. **Go Offline:**
   - DevTools → Network → Check "Offline"
   - Or disconnect internet

2. **Make a Sale:**
   - Add items to cart
   - Select Cash or Card payment
   - Click "Charge"
   - Should see "Sale queued" message

3. **Check Queue:**
   - Click "Check Queued Sales" button
   - Should show count > 0
   - Check console for logs

4. **Go Online:**
   - Uncheck "Offline" in Network tab
   - Or reconnect internet

5. **Trigger Sync:**
   - Click "🔄 Sync Queued Sales" button
   - Or wait for automatic sync (may take time)

6. **Verify:**
   - Check History tab for the sale
   - Check console for sync logs
   - Check queued sales count (should be 0)

## Debugging Steps

1. **Check Service Worker:**
   ```javascript
   navigator.serviceWorker.getRegistration().then(reg => console.log(reg))
   ```

2. **Check Online Status:**
   ```javascript
   console.log('Online:', navigator.onLine)
   ```

3. **Check Queued Sales:**
   - Use the "Check Queued Sales" button
   - Or check IndexedDB manually

4. **Check Network Requests:**
   - DevTools → Network tab
   - Look for POST requests to `/api/pos/finalize`
   - Check if they're failing or succeeding

5. **Check Console Logs:**
   - Look for "Service Worker intercepting" messages
   - Look for "Request failed, will be queued" messages
   - Look for "Replaying queued request" messages
   - Look for "sales-synced" messages

## Expected Behavior

1. **Offline Sale:**
   - Request fails → Service Worker queues it
   - User sees "Sale queued" message
   - Cart clears
   - Queued sales count increases

2. **Coming Online:**
   - Background Sync triggers (or manual trigger)
   - Queued requests are replayed
   - Sales are processed
   - History updates
   - Queued sales count decreases

3. **After Sync:**
   - Sales appear in History tab
   - Inventory is deducted
   - Session totals update

## If Still Not Working

1. **Clear Service Worker:**
   - DevTools → Application → Service Workers → Unregister
   - Hard refresh page

2. **Clear IndexedDB:**
   - DevTools → Application → IndexedDB → Delete "workbox-background-sync"
   - Refresh page

3. **Check Browser Console:**
   - Look for any errors
   - Check Network tab for failed requests

4. **Verify API Endpoint:**
   - Make sure `/api/pos/finalize` is working when online
   - Test with a normal online sale first

