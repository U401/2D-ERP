'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function AdminNotificationListener() {
  const supabase = useMemo(() => createClient(), [])
  const [isAdmin, setIsAdmin] = useState(false)
  const [toastMessages, setToastMessages] = useState<Array<{ id: number; title: string; body: string }>>([])

  // ── Role detection ────────────────────────────────────────────────────────
  useEffect(() => {
    async function checkRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      setIsAdmin(profile?.role === 'admin')
    }
    checkRole()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single()
        setIsAdmin(profile?.role === 'admin')
      } else {
        setIsAdmin(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  // ── Toast helper in a ref so it never causes effect re-runs ──────────────
  const showToast = useRef((opts: { title: string; body: string }) => {
    setToastMessages(prev => {
      const newToast = { id: Date.now(), ...opts }
      setTimeout(() => {
        setToastMessages(cur => cur.filter(t => t.id !== newToast.id))
      }, 8000)
      return [...prev, newToast]
    })
  })

  // ── Notification subscription (only while isAdmin) ────────────────────────
  useEffect(() => {
    if (!isAdmin) return

    let mounted = true
    let tauriPermGranted = false
    let channelReady = false

    async function setup() {
      // 1. Tauri notification permissions
      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
      if (isTauri) {
        try {
          const { isPermissionGranted, requestPermission, channels, createChannel } =
            await import('@tauri-apps/plugin-notification')

          tauriPermGranted = await isPermissionGranted()
          if (!tauriPermGranted) {
            const result = await requestPermission()
            tauriPermGranted = result === 'granted'
          }

          if (tauriPermGranted) {
            // Channel setup — needs notification:allow-create-channel + notification:allow-list-channels
            // Falls back gracefully if those capabilities are missing (uses default channel)
            try {
              const existing = (await channels()) || []
              if (!existing.find((c: any) => c.id === 'erp-admin-alerts')) {
                await createChannel({
                  id: 'erp-admin-alerts',
                  name: 'Admin Alerts',
                  description: 'Important notifications for managers and admins',
                  importance: 4,
                  visibility: 1,
                })
              }
              channelReady = true
            } catch (channelErr) {
              console.warn('[Notifications] Channel setup failed — will use default channel:', channelErr)
              channelReady = false
            }
          }
        } catch (e) {
          console.warn('[Notifications] Tauri permission setup failed:', e)
        }
      }

      if (!mounted) return null

      // 2. Unified send helper
      async function sendNotification(opts: { title: string; body: string }) {
        // Always show in-app toast first — works on all platforms
        showToast.current(opts)

        // Additionally fire Tauri OS push notification
        if (isTauri) {
          try {
            const { sendNotification: tauriSend, isPermissionGranted, requestPermission } =
              await import('@tauri-apps/plugin-notification')

            if (!tauriPermGranted) {
              tauriPermGranted = await isPermissionGranted()
              if (!tauriPermGranted) {
                const r = await requestPermission()
                tauriPermGranted = r === 'granted'
              }
            }

            if (tauriPermGranted) {
              // Only specify channelId if channel was successfully created (Android 8+)
              // Falls back to default channel so notification always fires
              tauriSend(channelReady ? { ...opts, channelId: 'erp-admin-alerts' } : opts)
            }
          } catch (e) {
            console.warn('[Notifications] Tauri push failed:', e)
          }
        }
      }

      // 3. Product capacity check
      async function checkProductCapacities(
        ingredientId: string,
        storeId: string,
        oldStock: number,
        newStock: number
      ) {
        if (!storeId) return

        const { data: recipes } = await supabase
          .from('recipes')
          .select('product_id, products(name, low_stock_threshold)')
          .eq('ingredient_id', ingredientId)
          .eq('store_id', storeId)

        if (!recipes || recipes.length === 0) return

        const productIds = recipes.map((r: any) => r.product_id)
        const { data: allRecipes } = await supabase
          .from('recipes')
          .select('product_id, ingredient_id, quantity')
          .in('product_id', productIds)
          .eq('store_id', storeId)

        if (!allRecipes) return

        const allIngredientIds = [...new Set(allRecipes.map((r: any) => r.ingredient_id))]
        const { data: allIngredients } = await supabase
          .from('ingredients')
          .select('id, current_stock')
          .in('id', allIngredientIds)

        if (!allIngredients) return

        const stockMap = new Map(allIngredients.map((i: any) => [i.id, i.current_stock]))

        const productsToNotify: { name: string; capacity: number }[] = []

        for (const recipe of recipes) {
          const productId = (recipe as any).product_id
          const productObj = (recipe as any).products || {}
          const productName = productObj.name || 'Unknown Product'
          const threshold = typeof productObj.low_stock_threshold === 'number'
            ? productObj.low_stock_threshold : 5
          const productRecipes = allRecipes.filter((r: any) => r.product_id === productId)

          let minOrdersOld = Infinity
          let minOrdersNew = Infinity

          for (const pr of productRecipes as any[]) {
            const oldS = pr.ingredient_id === ingredientId ? oldStock : (stockMap.get(pr.ingredient_id) || 0)
            const newS = pr.ingredient_id === ingredientId ? newStock : (stockMap.get(pr.ingredient_id) || 0)
            const qty = Number(pr.quantity) || 1
            if (Math.floor(oldS / qty) < minOrdersOld) minOrdersOld = Math.floor(oldS / qty)
            if (Math.floor(newS / qty) < minOrdersNew) minOrdersNew = Math.floor(newS / qty)
          }

          if (minOrdersNew <= threshold && minOrdersNew < minOrdersOld) {
            productsToNotify.push({ name: productName, capacity: minOrdersNew })
          }
        }

        for (const p of productsToNotify) {
          const title = p.capacity === 0 ? '❌ Out of Stock' : '📉 Low Stock Warning'
          const body = p.capacity === 0
            ? `${p.name} can no longer be made — ingredients depleted.`
            : `Only ${p.capacity} more order${p.capacity !== 1 ? 's' : ''} of ${p.name} can be made.`
          sendNotification({ title, body })
        }
      }

      // 4. Subscribe — store the *channel object*, not the Promise from subscribe()
      const channel = supabase.channel('admin-notifications-v2')

      channel
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ingredients' }, payload => {
          if (!mounted) return
          const oldRow = payload.old as any
          const newRow = payload.new as any
          const oldStock = Number(oldRow?.current_stock)
          const newStock = Number(newRow?.current_stock)

          if (!isNaN(newStock) && !isNaN(oldStock) && newStock !== oldStock) {
            if (newStock > oldStock) {
              const added = (newStock - oldStock).toFixed(2).replace(/\.00$/, '')
              sendNotification({
                title: '📦 Restock',
                body: `${newRow.name} restocked +${added}${newRow.unit || ''}. New total: ${newStock}${newRow.unit || ''}.`,
              })
            } else {
              checkProductCapacities(newRow.id, newRow.store_id, oldStock, newStock)
            }
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions' }, async payload => {
          if (!mounted) return
          const oldRow = payload.old as any
          const newRow = payload.new as any

          if (oldRow?.status !== 'closed' && newRow?.status === 'closed') {
            const { data: sales } = await supabase
              .from('sales')
              .select('id, total_amount, payment_method')
              .eq('session_id', newRow.id)
              .neq('status', 'refunded')

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
                  .map(([m, amt]) => `${m.charAt(0).toUpperCase() + m.slice(1)}: ₱${amt.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`)
                  .join(', ')
              : 'No sales'

            sendNotification({
              title: '📊 Session Closed',
              body: `${totalOrders} order${totalOrders !== 1 ? 's' : ''} · ₱${totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })} · ${breakdownStr}`,
            })
          }
        })
        .subscribe(status => {
          console.log('[Notifications] Channel status:', status)
        })

      // 5. Test event listener
      const handleTest = (e: any) => {
        const detail = e.detail || {}
        sendNotification({
          title: detail.title || '🔔 Notification Test',
          body: detail.body || 'In-app notifications are working correctly!',
        })
      }
      window.addEventListener('test-admin-notification', handleTest)

      return { channel, handleTest }
    }

    // Run setup and hold cleanup refs
    let cleanupChannel: any = null
    let cleanupHandler: ((e: any) => void) | null = null

    setup().then(result => {
      if (!result) return
      if (!mounted) {
        // Already unmounted while setup was async — clean up immediately
        supabase.removeChannel(result.channel)
        window.removeEventListener('test-admin-notification', result.handleTest)
        return
      }
      cleanupChannel = result.channel
      cleanupHandler = result.handleTest
    }).catch(err => {
      console.error('[Notifications] Setup failed:', err)
    })

    return () => {
      mounted = false
      if (cleanupChannel) supabase.removeChannel(cleanupChannel)
      if (cleanupHandler) window.removeEventListener('test-admin-notification', cleanupHandler)
    }
  }, [isAdmin, supabase])

  if (!isAdmin || toastMessages.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none max-w-[90vw] sm:max-w-sm pt-[max(0.5rem,env(safe-area-inset-top))]">
      {toastMessages.map(toast => (
        <div
          key={toast.id}
          className="bg-gray-900 text-white p-4 rounded-xl shadow-2xl pointer-events-auto border border-gray-700 transform transition-all animate-in slide-in-from-top-2 fade-in duration-300"
        >
          <div className="flex justify-between items-start gap-4">
            <div>
              <h4 className="font-bold text-sm text-gray-100">{toast.title}</h4>
              <p className="text-xs text-gray-300 mt-1 leading-relaxed">{toast.body}</p>
            </div>
            <button
              onClick={() => setToastMessages(cur => cur.filter(t => t.id !== toast.id))}
              className="text-gray-400 hover:text-white transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
