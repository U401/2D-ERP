'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export function AdminNotificationListener() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [toastMessages, setToastMessages] = useState<Array<{id: number, title: string, body: string}>>([])
  const supabase = createClient()

  useEffect(() => {
    async function checkRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'admin') {
        setIsAdmin(true)
      }
    }
    checkRole()
  }, [supabase])

  useEffect(() => {
    if (!isAdmin) return

    let mounted = true
    let notificationChannel: any = null

    async function setupNotifications() {
      try {
        // Only run Tauri code if inside Tauri
        const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
        
        let permissionGranted = false
        if (isTauri) {
          const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification')
          try {
            permissionGranted = await isPermissionGranted()
            if (!permissionGranted) {
              const permission = await requestPermission()
              permissionGranted = permission === 'granted'
            }
          } catch (permErr) {
            console.warn('Could not request notification permissions:', permErr)
          }
        }

        if (!mounted) return

        const safeSendNotification = async (opts: {title: string, body: string}) => {
          // 1. Show in-app toast
          setToastMessages(prev => {
            const newToast = { id: Date.now(), ...opts }
            setTimeout(() => {
              setToastMessages(current => current.filter(t => t.id !== newToast.id))
            }, 8000) // hide after 8 seconds
            return [...prev, newToast]
          })

          // 2. Send OS Push Notification
          if (isTauri && permissionGranted) {
            try {
              const { sendNotification } = await import('@tauri-apps/plugin-notification')
              sendNotification(opts)
            } catch (e) { console.warn('Failed to send push:', e) }
          }
        }

        // ─────────────────────────────────────────────────────────────────
        // Helper: check if ingredient stock drop affects product capacity
        // ─────────────────────────────────────────────────────────────────
        async function checkProductCapacities(ingredientId: string, storeId: string, oldStock: number, newStock: number) {
          const { data: recipes } = await supabase
            .from('recipes')
            .select('product_id, products(name, low_stock_threshold)')
            .eq('ingredient_id', ingredientId)
            .eq('store_id', storeId)

          if (!recipes || recipes.length === 0) return

          const productIds = recipes.map(r => r.product_id)
          
          const { data: allRecipes } = await supabase
            .from('recipes')
            .select('product_id, ingredient_id, quantity')
            .in('product_id', productIds)

          if (!allRecipes) return
          
          const allIngredientIds = [...new Set(allRecipes.map(r => r.ingredient_id))]
          const { data: allIngredients } = await supabase
            .from('ingredients')
            .select('id, current_stock')
            .in('id', allIngredientIds)

          if (!allIngredients) return

          const stockMap = new Map(allIngredients.map(i => [i.id, i.current_stock]))
          
          const productsToNotify = []
          
          for (const recipe of recipes) {
            const productId = recipe.product_id
            const productObj = (recipe.products as any) || {}
            const productName = productObj.name || 'Unknown Product'
            const threshold = typeof productObj.low_stock_threshold === 'number' ? productObj.low_stock_threshold : 5
            const productRecipes = allRecipes.filter(r => r.product_id === productId)
            
            let minOrdersOld = Infinity
            let minOrdersNew = Infinity
            
            for (const pr of productRecipes) {
              let oldS = stockMap.get(pr.ingredient_id) || 0
              let newS = stockMap.get(pr.ingredient_id) || 0
              
              if (pr.ingredient_id === ingredientId) {
                oldS = oldStock
                newS = newStock
              }
              
              const oldCanMake = Math.floor(oldS / pr.quantity)
              const newCanMake = Math.floor(newS / pr.quantity)
              
              if (oldCanMake < minOrdersOld) minOrdersOld = oldCanMake
              if (newCanMake < minOrdersNew) minOrdersNew = newCanMake
            }
            
            if (minOrdersNew <= threshold && minOrdersNew < minOrdersOld) {
              productsToNotify.push({ name: productName, capacity: minOrdersNew })
            }
          }
          
          productsToNotify.forEach(p => {
            let title = '📉 Order Capacity Warning'
            let body = `You can only make ${p.capacity} more orders of ${p.name}.`
            if (p.capacity === 0) {
              title = '❌ Cannot Make Order'
              body = `You can no longer make ${p.name} due to low stock.`
            }
            safeSendNotification({ title, body })
          })
        }

        // Create a single channel for all admin notifications to prevent connection drops
        const adminChannel = supabase.channel('admin-notifications')

        // ── Listener 1: Ingredient stock changes ──────────────────────────
        adminChannel.on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'ingredients' },
            (payload) => {
              const oldRow = payload.old as any
              const newRow = payload.new as any

              const oldStock = Number(oldRow?.current_stock)
              const newStock = Number(newRow?.current_stock)

              if (!isNaN(newStock) && !isNaN(oldStock) && newStock !== oldStock) {
                if (newStock > oldStock) {
                  // Restock — stock went up
                  const added = newStock - oldStock
                  safeSendNotification({
                    title: '📦 Restock',
                    body: `${newRow.name} restocked by ${added}${newRow.unit || ''}. New total: ${newStock}${newRow.unit || ''}.`,
                  })
                } else {
                  // Stock went down — check if any product capacity is getting low
                  checkProductCapacities(newRow.id, newRow.store_id, oldStock, newStock)
                }
              }
            }
          )

        // ── Listener 2: Session close → sales summary notification ─────────
        adminChannel.on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'sessions' },
            async (payload) => {
              const oldRow = payload.old as any
              const newRow = payload.new as any

              // Only react when a session transitions from open → closed
              if (oldRow?.status !== 'closed' && newRow?.status === 'closed') {
                const sessionId = newRow.id

                // Then fetch the sales summary asynchronously and send the summary
                supabase
                  .from('sales')
                  .select('id, total_amount, payment_method, sold_at')
                  .eq('session_id', sessionId)
                  .then(({ data: sales, error }) => {
                    if (error) {
                      console.error('Error fetching sales for notification:', error)
                    }

                    const safeSales = sales || []
                    const totalRevenue = safeSales.reduce((sum: number, s: any) => sum + parseFloat(s.total_amount), 0)
                    const totalOrders = safeSales.length

                    const breakdown: Record<string, number> = {}
                    for (const s of safeSales as any[]) {
                      const method = s.payment_method || 'cash'
                      breakdown[method] = (breakdown[method] || 0) + parseFloat(s.total_amount)
                    }
                    
                    const breakdownStr = Object.keys(breakdown).length > 0 
                      ? Object.entries(breakdown)
                          .map(([method, amt]) => `${method.charAt(0).toUpperCase() + method.slice(1)}: ₱${amt.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`)
                          .join(', ')
                      : 'No sales'

                    safeSendNotification({
                      title: '📊 Session Summary',
                      body: `${totalOrders} order${totalOrders !== 1 ? 's' : ''} · ₱${totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })} total · ${breakdownStr}`,
                    })
                  })
              }
            }
          )

        // Subscribe to the combined channel
        notificationChannel = adminChannel.subscribe()


      } catch (err) {
        console.warn('Failed to setup notifications:', err)
      }
    }

    setupNotifications()

    return () => {
      mounted = false
      if (notificationChannel) supabase.removeChannel(notificationChannel)
    }
  }, [isAdmin, supabase])

  if (!isAdmin || toastMessages.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none max-w-[90vw] sm:max-w-sm">
      {toastMessages.map(toast => (
        <div key={toast.id} className="bg-gray-900 text-white p-4 rounded-xl shadow-2xl pointer-events-auto border border-gray-700 transform transition-all animate-in slide-in-from-top-2 fade-in duration-300">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h4 className="font-bold text-sm text-gray-100">{toast.title}</h4>
              <p className="text-xs text-gray-300 mt-1 leading-relaxed">{toast.body}</p>
            </div>
            <button 
              onClick={() => setToastMessages(current => current.filter(t => t.id !== toast.id))}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
