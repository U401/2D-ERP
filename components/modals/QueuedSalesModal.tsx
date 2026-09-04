'use client'

import { useState, useEffect } from 'react'
import { checkQueuedSales, type QueuedSale } from '@/lib/utils/queued-sales'
import { getOfflineSales, removeOfflineSale } from '@/lib/utils/offline-sales-storage'
import { finalizeSale } from '@/app/actions/sales'
import { format } from 'date-fns'
import { formatDisplayId } from '@/lib/utils/display-id'

type Props = {
  isOpen: boolean
  onClose: () => void
  onSyncComplete?: () => void
}

export default function QueuedSalesModal({ isOpen, onClose, onSyncComplete }: Props) {
  const [queuedSales, setQueuedSales] = useState<QueuedSale[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadQueuedSales()
    }
  }, [isOpen])

  async function loadQueuedSales() {
    setLoading(true)
    try {
      const sales = await checkQueuedSales()
      setQueuedSales(sales)
    } catch (error) {
      console.error('Error loading queued sales:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      console.log('Manually syncing offline sales...')
      
      // Get localStorage sales
      const localSales = getOfflineSales()
      let syncedCount = 0
      let failedCount = 0
      
      // Try to sync each localStorage sale
      for (const sale of localSales) {
        try {
          const method = sale.paymentMethod as 'cash' | 'card' | 'gcash' | undefined
          if (!method || !['cash', 'card', 'gcash'].includes(method)) {
            failedCount++
            console.error('Invalid payment method on offline sale:', sale.id, sale.paymentMethod)
            continue
          }

          const result = await finalizeSale(
            sale.sessionId,
            sale.items,
            method
          )

          if (result.success) {
            removeOfflineSale(sale.id)
            syncedCount++
            console.log('✅ Synced offline sale:', sale.id)
          } else {
            failedCount++
            console.error('Failed to sync sale:', sale.id, result.error)
          }
        } catch (error) {
          failedCount++
          console.error('Error syncing sale:', sale.id, error)
        }
      }
      
      // Also trigger Background Sync if available
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration && 'sync' in registration) {
        try {
          // TS lib.dom typings don't always include Background Sync properly;
          // feature-detect and safely narrow/cast before calling.
          const sync = (registration as unknown as { sync?: { register: (tag: string) => Promise<void> } }).sync
          if (sync?.register) {
            await sync.register('pos-sales-queue')
          }
          console.log('Background Sync triggered')
        } catch (error: any) {
          if (error.name !== 'InvalidStateError') {
            console.error('Background Sync error:', error)
          }
        }
      }
      
      if (syncedCount > 0) {
        alert(`Synced ${syncedCount} sale(s)${failedCount > 0 ? `. ${failedCount} failed.` : '!'}`)
      } else if (failedCount > 0) {
        alert(`Failed to sync ${failedCount} sale(s). Please check your connection.`)
      } else {
        alert('No offline sales to sync.')
      }
      
      // Refresh the list
      await loadQueuedSales()
      if (onSyncComplete) {
        onSyncComplete()
      }
    } catch (error) {
      console.error('Error syncing:', error)
      alert('Error syncing sales. Check console for details.')
    } finally {
      setSyncing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl border border-gray-200 shadow-lg flex flex-col max-h-[calc(100dvh-2rem)]">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Queued Sales</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="text-blue-600 hover:text-blue-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title="Sync queued sales"
            >
              <span className={`material-symbols-outlined ${syncing ? 'animate-spin' : ''}`}>
                {syncing ? 'hourglass_empty' : 'sync'}
              </span>
            </button>
            <button
              onClick={loadQueuedSales}
              className="text-gray-500 hover:text-gray-700 text-sm"
              title="Refresh"
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-900 transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-center py-8">
              <span className="material-symbols-outlined animate-spin text-gray-400">
                hourglass_empty
              </span>
              <p className="text-gray-500 mt-2">Loading queued sales...</p>
            </div>
          ) : queuedSales.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-gray-300 text-6xl">
                check_circle
              </span>
              <p className="text-gray-500 mt-4 text-lg font-medium">No Queued Sales</p>
              <p className="text-gray-400 text-sm mt-2">
                All sales have been processed or there are no pending sales.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {queuedSales.map((sale, index) => (
                <div
                  key={sale.id || index}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Sale #{index + 1}
                        {sale.source && (
                          <span className="ml-2 text-xs text-gray-500">
                            ({sale.source === 'localStorage' ? 'Local' : 'Background Sync'})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Queued: {format(new Date(sale.timestamp), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                    <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                      {sale.paymentMethod.toUpperCase()}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-gray-600">
                      <span className="font-medium">Session:</span>{' '}
                      {formatDisplayId(sale.sessionId, 'SES')}
                    </div>
                    <div className="text-xs text-gray-600">
                      <span className="font-medium">Items:</span> {sale.items.length}
                    </div>
                    {sale.items.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {sale.items.map((item, itemIndex) => (
                          <div
                            key={itemIndex}
                            className="text-xs text-gray-600 flex justify-between"
                          >
                            <span>
                              {item.quantity}x Product ({formatDisplayId(item.product_id, 'PRD')})
                            </span>
                            <span className="font-medium">
                              ₱{(item.unit_price * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="pt-2 border-t border-gray-200 mt-2 space-y-1">
                      {(() => {
                        const subtotal = sale.items.reduce(
                          (sum, item) => sum + item.unit_price * item.quantity,
                          0
                        )
                        const taxRate = 0.08 // 8% tax rate (matching POS page)
                        const tax = subtotal * taxRate
                        const total = subtotal + tax
                        
                        return (
                          <>
                            <div className="flex justify-between text-xs text-gray-600">
                              <span>Subtotal:</span>
                              <span>₱{subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-600">
                              <span>Tax (8%):</span>
                              <span>₱{tax.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm font-semibold text-gray-900 pt-1 border-t border-gray-200">
                              <span>Total:</span>
                              <span>₱{total.toFixed(2)}</span>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              {queuedSales.length === 0
                ? 'All sales synced'
                : `${queuedSales.length} sale${queuedSales.length !== 1 ? 's' : ''} pending sync`}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

