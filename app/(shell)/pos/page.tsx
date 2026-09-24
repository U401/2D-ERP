'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { openSession, closeSession } from '@/app/actions/session'
import { finalizeSale } from '@/app/actions/sales'
import { getCustomerByPhone } from '@/app/actions/customers'
import SessionManagementModal from '@/components/modals/SessionManagementModal'
import GCashPaymentModal from '@/components/modals/GCashPaymentModal'
import QueuedSalesModal from '@/components/modals/QueuedSalesModal'
import ClockInOutModal from '@/components/modals/ClockInOutModal'
import CustomizationModal from '@/components/modals/CustomizationModal'
import { getClockedInStatus } from '@/app/actions/hr'
import { format } from 'date-fns'
import type { GCashVerificationResult } from '@/lib/types/gcash'
import { checkQueuedSales, getQueuedSalesCount } from '@/lib/utils/queued-sales'
import { formatDisplayId } from '@/lib/utils/display-id'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { 
  storeOfflineSale, 
  getOfflineSales, 
  removeOfflineSale,
  getOfflineSalesCount as getLocalOfflineSalesCount,
  type OfflineSale 
} from '@/lib/utils/offline-sales-storage'

type Product = {
  id: string
  name: string
  price: number
  category: string
  image_url: string | null
}

export type Customization = {
  ingredient_id: string
  name: string
  delta: number
  price_adjustment: number
}

type CartItem = {
  cart_item_id: string
  product: Product
  quantity: number
  customizations: Customization[]
}

type Session = {
  id: string
  opened_at: string
  closed_at: string | null
  status: 'open' | 'closed'
}

type Sale = {
  id: string
  total_amount: number
  sold_at: string
  payment_method: 'cash' | 'card' | 'gcash' | null
  gcash_reference_code?: string | null
  gcash_transaction_timestamp_utc?: string | null
  gcash_verification_status?: string | null
  sale_items: Array<{
    id: string
    product_id: string
    quantity: number
    price: number
    customizations?: any
    products?: {
      id: string
      name: string
      image_url: string | null
    } | null
  }>
}

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'order' | 'history'>('order')
  const [orderHistory, setOrderHistory] = useState<Sale[]>([])
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'gcash'>('cash')
  const [showGCashModal, setShowGCashModal] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Sale | null>(null)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [queuedSalesCount, setQueuedSalesCount] = useState(0)
  const [showQueuedSalesModal, setShowQueuedSalesModal] = useState(false)
  const [showClockModal, setShowClockModal] = useState(false)
  const [customerPhone, setCustomerPhone] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<{id: string, name: string} | null>(null)
  const [itemToCustomize, setItemToCustomize] = useState<CartItem | null>(null)

  // Define all functions before useEffect hooks to avoid hoisting issues
  const loadProducts = useCallback(async () => {
    const supabase = createClient()
    
    // Get current user to determine store_id
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('store_id')
      .eq('id', user.id)
      .single()

    if (!profile?.store_id) return

    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', profile.store_id)
      .order('name')

    if (data) {
      setProducts(data)
      // Default to the first category if none selected
      const cats = Array.from(new Set(data.map((p: any) => p.category))).filter(Boolean)
      if (cats.length > 0 && !selectedCategory) {
        setSelectedCategory(cats[0] as string)
      }
    }
  }, [selectedCategory])

  // Track product availability in real time
  useAutoRefresh(loadProducts, 5000)

  async function loadCurrentSession() {
    // Query directly from client to get most up-to-date data
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSession(null)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('store_id')
      .eq('id', user.id)
      .single()

    if (!profile?.store_id) {
      setSession(null)
      return
    }

    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('status', 'open')
      .eq('user_id', user.id)
      .eq('store_id', profile.store_id)
      .order('opened_at', { ascending: false })
      .limit(1)

    if (error) {
      console.error('Error loading session:', error)
      setSession(null)
      return
    }

    // Handle array response (limit(1) returns an array)
    setSession(data && data.length > 0 ? data[0] : null)
  }

  const loadOrderHistory = useCallback(async () => {
    const supabase = createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('store_id')
      .eq('id', user.id)
      .single()

    if (!profile?.store_id) return

    // Load all sales including GCash transactions - no payment method filter
    // Ensure we get all payment methods: cash, card, and gcash
    const { data, error } = await supabase
      .from('sales')
      .select('*, sale_items(*, products(id, name, image_url))')
      .eq('store_id', profile.store_id)
      .order('sold_at', { ascending: false })
      .limit(20)
    
    if (error) {
      console.error('Error loading order history:', error)
      return
    }
    
    if (data) {
      console.log('Loaded order history:', {
        count: data.length,
        sales: data.map(s => ({ id: s.id, payment_method: s.payment_method, total: s.total }))
      })
      setOrderHistory(data)
    }
  }, [])

  useAutoRefresh(loadOrderHistory, 5000)

  async function checkQueuedSalesStatus() {
    try {
      console.log('Checking for queued sales...')
      // Check both Background Sync queue and localStorage fallback
      const bgSyncCount = await getQueuedSalesCount()
      const localCount = getLocalOfflineSalesCount()
      const totalCount = bgSyncCount + localCount
      
      console.log(`Queued sales count - Background Sync: ${bgSyncCount}, localStorage: ${localCount}, Total: ${totalCount}`)
      setQueuedSalesCount(totalCount)
      
      if (totalCount > 0) {
        const bgSyncSales = await checkQueuedSales()
        const localSales = getOfflineSales()
        console.log(`Found ${bgSyncCount} Background Sync sales and ${localCount} localStorage sales`)
      } else {
        console.log('No queued sales found')
      }
    } catch (error) {
      console.error('Error checking queued sales:', error)
      // Fallback to localStorage count
      const localCount = getLocalOfflineSalesCount()
      setQueuedSalesCount(localCount)
    }
  }

  // Initial data load and event listeners
  useEffect(() => {
    loadProducts()
    loadCurrentSession()
    checkQueuedSalesStatus() // Check for queued sales on mount
    
    // Realtime: only watch session changes for the current user.
    const supabase = createClient()
    let channel: any
    let cancelled = false

    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return

      channel = supabase
        .channel('session-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'sessions',
            filter: `user_id=eq.${user.id}`,
          },
          async () => {
            await loadCurrentSession()
          }
        )
        .subscribe()
    })()

    // Listen for service worker messages about synced sales
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const handleMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'sales-synced') {
          console.log('Received sales-synced message from service worker')
          // Refresh order history when sales are synced
          loadOrderHistory()
          // Recheck queued sales count after sync
          checkQueuedSalesStatus()
        }
      }
      navigator.serviceWorker.addEventListener('message', handleMessage)
      
      // Listen for online event to manually trigger sync
      const handleOnline = async () => {
        console.log('Browser back online, checking for queued sales...')
        // Wait a moment for service worker to process
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Check if service worker can trigger sync
        const registration = await navigator.serviceWorker.getRegistration()
        if (registration && 'sync' in registration) {
          try {
            // Manually register sync to trigger queued requests
            const sync = (registration as unknown as { sync?: { register: (tag: string) => Promise<void> } }).sync
            if (sync?.register) {
              await sync.register('pos-sales-queue')
            }
            console.log('Manually triggered sync for pos-sales-queue')
          } catch (error) {
            console.log('Could not manually trigger sync (may already be queued):', error)
          }
        }
        
        // Check queued sales status
        checkQueuedSalesStatus()
        // Refresh order history
        loadOrderHistory()
      }
      
      window.addEventListener('online', handleOnline)
      
      return () => {
        cancelled = true
        if (channel) channel.unsubscribe()
        navigator.serviceWorker.removeEventListener('message', handleMessage)
        window.removeEventListener('online', handleOnline)
      }
    }

    return () => {
      cancelled = true
      if (channel) channel.unsubscribe()
    }
  }, [])

  // Effect to periodically check for queued sales
  useEffect(() => {
    // Initial check
    checkQueuedSalesStatus()
    
    const interval = setInterval(checkQueuedSalesStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (activeTab === 'history') {
      // Always refresh history when switching to history tab
      loadOrderHistory()
    }
  }, [activeTab])

  const sessionOpen = session?.status === 'open'

  // Lock POS when there is no open session: clear any staged cart/payment state.
  useEffect(() => {
    if (!sessionOpen) {
      setCart([])
      setPaymentMethod('cash')
      setShowGCashModal(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionOpen])

  function addToCart(product: Product) {
    if (!sessionOpen) {
      // POS is locked until a session is open
      setShowSessionModal(true)
      return
    }
    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.product.id === product.id && item.customizations.length === 0)
      if (existingIndex >= 0) {
        const newCart = [...prev]
        newCart[existingIndex].quantity += 1
        return newCart
      }
      return [...prev, { cart_item_id: crypto.randomUUID(), product, quantity: 1, customizations: [] }]
    })
  }

  function updateCartQuantity(cartItemId: string, delta: number) {
    if (!sessionOpen) return
    setCart((prev) => {
      const item = prev.find((i) => i.cart_item_id === cartItemId)
      if (!item) return prev

      const newQuantity = item.quantity + delta
      if (newQuantity <= 0) {
        return prev.filter((i) => i.cart_item_id !== cartItemId)
      }

      return prev.map((i) =>
        i.cart_item_id === cartItemId ? { ...i, quantity: newQuantity } : i
      )
    })
  }

  function removeFromCart(cartItemId: string) {
    if (!sessionOpen) return
    setCart((prev) => prev.filter((item) => item.cart_item_id !== cartItemId))
  }

  async function handleFinalizeSale(gcashData?: {
    referenceCode: string
    transactionTimestamp: Date
    imageUrl: string | null
  }): Promise<{ success: boolean; error?: string }> {
    if (!session || cart.length === 0) {
      return { success: false, error: 'Session not open or cart is empty' }
    }

    // GCash requires online connection
    if (paymentMethod === 'gcash' && typeof navigator !== 'undefined' && !navigator.onLine) {
      alert('GCash payments require an internet connection')
      return { success: false, error: 'GCash requires internet connection' }
    }

    setIsProcessing(true)
    try {
      const items = cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.price + item.customizations.reduce((sum, c) => sum + (c.price_adjustment || 0), 0),
        customizations: item.customizations
      }))

      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine

      // Offline-only behavior: cash/card can be queued locally, GCash cannot.
      if (isOffline && (paymentMethod === 'cash' || paymentMethod === 'card')) {
        try {
          const saleId = storeOfflineSale({
            sessionId: session.id,
            paymentMethod,
            items,
          })
          console.log('✅ Stored offline sale in localStorage:', saleId)
        } catch (storageError) {
          console.error('Error storing offline sale:', storageError)
          alert('Error storing offline sale. Please try again.')
          return { success: false, error: 'Failed to store offline sale' }
        }

        alert('Sale queued. Will sync when back online.')
        setCart([])
        setPaymentMethod('cash')
        checkQueuedSalesStatus()
        setShowQueuedSalesModal(true)
        return { success: true }
      }

      console.log('Finalizing sale with params:', {
        sessionId: session.id,
        itemsCount: items.length,
        paymentMethod,
        customerId: selectedCustomer?.id,
      })

      const result = await finalizeSale(
        session.id,
        items,
        paymentMethod,
        paymentMethod === 'gcash' && gcashData
          ? {
              referenceCode: gcashData.referenceCode,
              transactionTimestamp: gcashData.transactionTimestamp,
              imageUrl: gcashData.imageUrl,
            }
          : undefined,
        selectedCustomer?.id,
        `pos_${Date.now()}_${Math.random().toString(36).substring(7)}`
      )

      console.log('Finalize sale result:', result)

      if (result && result.success) {
        setCart([])
        setPaymentMethod('cash') // Reset to default
        setCustomerPhone('')
        setSelectedCustomer(null)
        setShowGCashModal(false)
        await loadCurrentSession()
        // Always refresh history so it's up-to-date when user switches to history tab
        // Add delay to ensure database transaction has committed
        await new Promise(resolve => setTimeout(resolve, 500))
        await loadOrderHistory()
        return { success: true }
      }

      return { success: false, error: result?.error || 'Failed to finalize sale' }
    } catch (error: any) {
      console.error('CRITICAL Error in handleFinalizeSale:', error)
      const errorMessage = error?.message || 'An unexpected error occurred during sale'
      return { success: false, error: errorMessage }
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleGCashConfirm(
    verificationResult: GCashVerificationResult & { imageUrl: string | null }
  ) {
    // Ensure session is still open before finalizing
    if (!session) {
      alert('Session is not open. Please open a session before processing GCash payments.')
      setShowGCashModal(false)
      return
    }
    
    // Ensure cart is not empty
    if (cart.length === 0) {
      alert('No items in cart. Please add items before processing GCash payments.')
      setShowGCashModal(false)
      return
    }
    
    if (
      verificationResult.success &&
      verificationResult.status === 'confirmed' &&
      verificationResult.transactionData
    ) {
      try {
        // Convert timestamp to Date object if it's a string (JSON serialization)
        const timestamp = verificationResult.transactionData.transactionTimestamp instanceof Date
          ? verificationResult.transactionData.transactionTimestamp
          : new Date(verificationResult.transactionData.transactionTimestamp)
        
        const result = await handleFinalizeSale({
          referenceCode: verificationResult.transactionData.referenceCode,
          transactionTimestamp: timestamp,
          imageUrl: verificationResult.imageUrl,
        })
        
        // Refresh history after GCash sale completes
        // handleFinalizeSale already calls loadOrderHistory, but we'll ensure it happens
        if (result && result.success) {
          // Additional refresh with delay to ensure database has committed
          // Use await instead of setTimeout to ensure it completes
          await new Promise(resolve => setTimeout(resolve, 1000))
          await loadOrderHistory()
        }
      } catch (error) {
        console.error('Error finalizing GCash sale:', error)
        alert(`Error processing payment: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    } else {
      // Verification failed - show error
      const errorMsg = verificationResult.error || `Transaction rejected: ${verificationResult.rejectionReason || 'Unknown reason'}`
      alert(errorMsg)
    }
  }

  const categories = Array.from(new Set(products.map((p) => p.category))).filter(Boolean)
  const filteredProducts = products.filter((p) => {
    const matchesCategory = !selectedCategory || p.category === selectedCategory
    const matchesSearch =
      !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const total = cart.reduce(
    (sum, item) => sum + (item.product.price + item.customizations.reduce((acc, c) => acc + (c.price_adjustment || 0), 0)) * item.quantity,
    0
  )

  return (
    <div className="flex flex-1 min-h-0 min-w-0">
      <div className="flex-1 min-w-0 flex flex-col lg:flex-row gap-0 overflow-hidden">
        {/* Product Grid */}
        <div className="flex-1 min-w-0 flex flex-col gap-0 overflow-hidden">
          {/* Search */}
          <div className="px-4 pt-4 pb-2 flex items-center gap-3">
            <label className="flex flex-col min-w-48 h-16 w-full">
              <div className="flex w-full flex-1 items-stretch rounded-xl h-full shadow-sm">
                <div className="text-gray-400 flex border-none bg-gray-100 items-center justify-center pl-5 rounded-l-xl border-r-0">
                  <span className="material-symbols-outlined icon-xl">search</span>
                </div>
                <input
                  id="pos-search"
                  name="pos-search"
                  type="search"
                  suppressHydrationWarning
                  className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-gray-900 focus:outline-0 focus:ring-0 border-none bg-gray-100 focus:border-none h-full placeholder:text-gray-400 px-4 rounded-l-none border-l-0 pl-3 text-xl font-normal leading-relaxed"
                  placeholder="Find a product..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </label>
          </div>

          {/* Main Grid Area */}
          <div className="flex-1 flex flex-col min-h-0 relative p-4 overflow-y-auto bg-gray-50/50">
            {searchQuery ? (
               <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] content-start gap-4">
                 {filteredProducts.map((product) => (
                   <button
                     key={product.id}
                     onClick={() => addToCart(product)}
                     disabled={!sessionOpen}
                     title={!sessionOpen ? 'Open a session to start selling' : undefined}
                     className="flex flex-col gap-3 pb-4 cursor-pointer rounded-2xl bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 p-3 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-white shadow-sm hover:shadow-lg"
                   >
                     {product.image_url ? (
                       <img
                         src={product.image_url}
                         alt={product.name}
                         className="w-full aspect-square object-cover rounded-xl"
                         onError={(e) => {
                           const target = e.target as HTMLImageElement;
                             target.style.display = 'none';
                             target.nextElementSibling?.classList.remove('hidden');
                         }}
                       />
                     ) : null}
                     <div
                       className={`w-full aspect-square bg-center bg-no-repeat bg-cover rounded-xl bg-gradient-to-br from-amber-800 to-amber-600 ${
                         product.image_url ? 'hidden' : ''
                       }`}
                     ></div>
                     <div className="flex flex-col px-1">
                       <p className="text-gray-900 text-sm md:text-base font-bold leading-tight line-clamp-2">
                         {product.name}
                       </p>
                       <p className="text-emerald-700 text-sm md:text-base font-bold mt-0.5">
                         ₱{product.price.toFixed(2)}
                       </p>
                     </div>
                   </button>
                 ))}
               </div>
            ) : !selectedCategory ? (
               <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] content-start gap-4">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className="flex flex-col items-center justify-center gap-4 p-8 bg-white border border-gray-200 rounded-3xl shadow-sm hover:shadow-md hover:border-blue-300 hover:bg-blue-50 transition-all active:scale-95 min-h-[160px]"
                    >
                      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-500">
                        <span className="material-symbols-outlined text-3xl">category</span>
                      </div>
                      <span className="text-xl font-bold text-gray-900 text-center">{cat}</span>
                    </button>
                  ))}
               </div>
            ) : (
               <div className="flex flex-col gap-6">
                 <div className="flex items-center gap-4 pb-4 border-b border-gray-200 sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 pt-2 -mt-2">
                    <button 
                      onClick={() => setSelectedCategory('')}
                      className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all shadow-sm active:scale-95"
                    >
                       <span className="material-symbols-outlined text-2xl">arrow_back</span>
                    </button>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">{selectedCategory}</h2>
                 </div>
                 <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] content-start gap-4">
                   {filteredProducts.map((product) => (
                     <button
                       key={product.id}
                       onClick={() => addToCart(product)}
                       disabled={!sessionOpen}
                       title={!sessionOpen ? 'Open a session to start selling' : undefined}
                       className="flex flex-col gap-3 pb-4 cursor-pointer rounded-2xl bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 p-3 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-white shadow-sm hover:shadow-lg"
                     >
                       {product.image_url ? (
                         <img
                           src={product.image_url}
                           alt={product.name}
                           className="w-full aspect-square object-cover rounded-xl"
                           onError={(e) => {
                             const target = e.target as HTMLImageElement;
                             target.style.display = 'none';
                             target.nextElementSibling?.classList.remove('hidden');
                           }}
                         />
                       ) : null}
                       <div
                         className={`w-full aspect-square bg-center bg-no-repeat bg-cover rounded-xl bg-gradient-to-br from-amber-800 to-amber-600 ${
                           product.image_url ? 'hidden' : ''
                         }`}
                       ></div>
                       <div className="flex flex-col px-1">
                         <p className="text-gray-900 text-sm md:text-base font-bold leading-tight line-clamp-2">
                           {product.name}
                         </p>
                         <p className="text-emerald-700 text-sm md:text-base font-bold mt-0.5">
                           ₱{product.price.toFixed(2)}
                         </p>
                       </div>
                     </button>
                   ))}
                 </div>
               </div>
            )}
          </div>
        </div>

        {/* Cart Sidebar */}
        <div className="lg:w-[350px] xl:w-[400px] w-full bg-white border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col min-h-0 shrink lg:shrink-0">
          {/* Session Banner */}
          <div className="p-4 border-b border-gray-200 space-y-3">
            <button
              onClick={async () => {
                await loadCurrentSession()
                setShowSessionModal(true)
              }}
              className={`w-full px-5 py-4 rounded-xl text-xl font-bold transition-colors ${
                session?.status === 'open'
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-gray-100 text-gray-600 border border-gray-200'
              }`}
            >
              {session && session.status === 'open' ? (
                <span>Session Open • {format(new Date(session.opened_at), 'h:mm a')}</span>
              ) : (
                'Session Closed'
              )}
            </button>

            {/* Queued Sales Indicator */}
            <button
              onClick={() => setShowQueuedSalesModal(true)}
              className={`w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl border transition-colors ${
                queuedSalesCount > 0
                  ? 'bg-yellow-50 border-yellow-300 hover:bg-yellow-100 text-yellow-800'
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-600'
              }`}
            >
              <span className={`material-symbols-outlined icon-xl ${
                queuedSalesCount > 0 ? 'text-yellow-600' : 'text-gray-400'
              }`}>
                {queuedSalesCount > 0 ? 'sync' : 'check_circle'}
              </span>
              <span className={`text-lg font-semibold ${
                queuedSalesCount > 0 ? 'text-yellow-800' : 'text-gray-500'
              }`}>
                {queuedSalesCount > 0
                  ? `${queuedSalesCount} sale${queuedSalesCount !== 1 ? 's' : ''} queued`
                  : 'No queued sales'}
              </span>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('order')}
              className={`flex-1 flex items-center justify-center whitespace-nowrap px-5 py-4 text-xl font-bold border-b-4 transition-colors ${
                activeTab === 'order'
                  ? 'text-gray-900 border-gray-900'
                  : 'text-gray-400 border-transparent hover:text-gray-700'
              }`}
            >
              Order
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 flex items-center justify-center whitespace-nowrap px-5 py-4 text-xl font-bold border-b-4 transition-colors ${
                activeTab === 'history'
                  ? 'text-gray-900 border-gray-900'
                  : 'text-gray-400 border-transparent hover:text-gray-700'
              }`}
            >
              History
            </button>
          </div>

          {activeTab === 'order' ? (
            <>
              {/* Cart Items */}
              <div className="flex-grow min-h-0 py-2 px-4 space-y-2 overflow-y-auto">
                {cart.length === 0 ? (
                  <p className="text-gray-400 text-xl text-center py-14">Cart is empty</p>
                ) : (
                  cart.map((item) => {
                    const itemUnitPrice = item.product.price + item.customizations.reduce((sum, c) => sum + (c.price_adjustment || 0), 0);
                    return (
                    <div
                      key={item.cart_item_id}
                      className="flex flex-col gap-2 bg-gray-50 rounded-xl p-3"
                    >
                      <div className="flex items-center gap-3">
                        {item.product.image_url && (
                          <img
                            src={item.product.image_url}
                            alt={item.product.name}
                            className="w-12 h-12 object-cover rounded-lg flex-shrink-0"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.style.display = 'none'
                            }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 text-base font-bold leading-tight truncate">
                            {item.product.name}
                          </p>
                          <p className="text-gray-500 text-sm">
                            ₱{itemUnitPrice.toFixed(2)}
                          </p>
                        </div>
                        {/* +/- quantity controls */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => updateCartQuantity(item.cart_item_id, -1)}
                            className="w-9 h-9 rounded-xl bg-gray-200 hover:bg-gray-300 active:scale-95 flex items-center justify-center text-gray-900 font-bold text-2xl transition-all"
                            aria-label="Decrease quantity">
                              <span className="material-symbols-outlined">remove</span>
                            </button>
                          <span className="w-9 text-center text-xl font-bold text-gray-900">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateCartQuantity(item.cart_item_id, 1)}
                            className="w-9 h-9 rounded-xl bg-gray-800 hover:bg-gray-700 active:scale-95 flex items-center justify-center text-white font-bold text-2xl transition-all"
                            aria-label="Increase quantity">
                              <span className="material-symbols-outlined">add</span>
                            </button>
                        </div>
                        <p className="text-gray-900 w-20 text-right text-base font-bold shrink-0">
                          ₱{(itemUnitPrice * item.quantity).toFixed(2)}
                        </p>
                        <button
                          onClick={() => removeFromCart(item.cart_item_id)}
                          className="text-gray-300 hover:text-red-500 transition-colors p-1 shrink-0"
                        >
                          <span className="material-symbols-outlined icon-xl">delete</span>
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-1 pl-[68px]">
                        <div className="flex flex-wrap gap-1">
                          {item.customizations.map(c => (
                             <span key={c.ingredient_id} className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-md font-medium">
                                {c.delta > 0 ? '+' : ''}{c.delta} {c.name}
                             </span>
                          ))}
                        </div>
                        <button
                          onClick={() => setItemToCustomize(item)}
                          className="text-sm font-bold text-blue-600 hover:text-blue-800 shrink-0 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                        >
                          Customize
                        </button>
                      </div>
                    </div>
                  )})
                )}
              </div>

              {/* Cart Footer */}
              <div className="p-4 border-t border-gray-200 space-y-2 shrink-0">
                <div className="flex justify-between text-gray-900 font-black text-2xl">
                  <span>Total</span>
                  <span>₱{total.toFixed(2)}</span>
                </div>

                {/* Customer Phone - commented out
                <div>
                  <label className="text-base text-gray-600 mb-1 block font-medium">Customer Phone (optional)</label>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      placeholder="09123456789"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      onBlur={async () => {
                        if (customerPhone.length >= 10) {
                          try {
                            const result = await getCustomerByPhone(customerPhone)
                            if (result.success && result.customer) {
                              setSelectedCustomer(result.customer)
                            } else {
                              setSelectedCustomer(null)
                            }
                          } catch (error) {
                            console.error('Error fetching customer:', error)
                            setSelectedCustomer(null)
                          }
                        } else if (customerPhone.length === 0) {
                          setSelectedCustomer(null)
                        }
                      }}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 text-lg"
                    />
                    {selectedCustomer && (
                      <span className="px-3 py-3 bg-green-50 text-green-700 rounded-xl text-base font-semibold">
                        {selectedCustomer.name}
                      </span>
                    )}
                  </div>
                </div>
                */}

                {/* Payment Method Selection */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setPaymentMethod('cash')}
                    className={`flex flex-col items-center justify-center h-14 px-2 rounded-xl text-sm font-bold tracking-wide transition-all active:scale-95 ${
                      paymentMethod === 'cash'
                        ? 'bg-gray-900 text-white shadow-lg'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <span className="material-symbols-outlined text-2xl mb-0.5">payments</span>
                    <span className="text-sm">Cash</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('card')}
                    className={`flex flex-col items-center justify-center h-14 px-2 rounded-xl text-sm font-bold tracking-wide transition-all active:scale-95 ${
                      paymentMethod === 'card'
                        ? 'bg-gray-900 text-white shadow-lg'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <span className="material-symbols-outlined text-2xl mb-0.5">credit_card</span>
                    <span className="text-sm">Card</span>
                  </button>
                  <button
                    onClick={() => {
                      if (!session) {
                        alert('Please open a session before processing GCash payments.')
                        return
                      }
                      if (cart.length === 0) {
                        alert('Please add items to cart before processing GCash payments.')
                        return
                      }
                      setPaymentMethod('gcash')
                      setShowGCashModal(true)
                    }}
                    disabled={!session || cart.length === 0}
                    className={`flex flex-col items-center justify-center h-14 px-2 rounded-xl text-sm font-bold tracking-wide transition-all active:scale-95 ${
                      paymentMethod === 'gcash'
                        ? 'bg-gray-900 text-white shadow-lg'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    } ${!session || cart.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className="material-symbols-outlined text-2xl mb-0.5">qr_code_scanner</span>
                    <span className="text-sm">GCash</span>
                  </button>
                </div>

                {checkoutError && (
  <div className="w-full bg-red-100 text-red-700 p-3 rounded-lg text-sm font-medium text-center border border-red-200">
    {checkoutError}
  </div>
)}
<button
  onClick={async () => {
    setCheckoutError(null);
    if (!session) {
                      alert('Please open a session before processing payments.')
                      return
                    }
                    if (cart.length === 0) {
                      alert('Please add items to cart before processing payments.')
                      return
                    }
                    if (paymentMethod === 'gcash') {
                      setShowGCashModal(true)
                    } else {
                      const result = await handleFinalizeSale()
                      if (result && !result.success) {
                        setCheckoutError(result.error || 'Failed to finalize sale')
                      }
                    }
                  }}
                  disabled={!session || cart.length === 0 || isProcessing}
                  className="w-full flex items-center justify-center h-14 px-6 rounded-xl bg-gray-900 text-white text-xl font-black tracking-wide hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                >
                  {isProcessing ? 'Processing...' : `Charge ₱${total.toFixed(2)}`}
                </button>

                <button
                  onClick={() => {
                    setCart([])
                    setPaymentMethod('cash')
                  }}
                  disabled={cart.length === 0}
                  className="w-full flex items-center justify-center h-10 px-6 rounded-lg text-gray-400 text-base font-semibold tracking-wide hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Clear Cart
                </button>
              </div>
            </>
          ) : (
            <div className="flex-grow py-4 px-4 space-y-2 overflow-y-auto">
              {orderHistory.length === 0 ? (
                <p className="text-gray-400 text-xl text-center py-14">No order history</p>
              ) : (
                orderHistory.map((sale) => (
                  <div
                    key={sale.id}
                    onClick={() => {
                      setSelectedOrder(sale)
                      setShowOrderModal(true)
                    }}
                    className="flex justify-between items-center py-4 px-4 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors border border-gray-100"
                  >
                    <div className="flex flex-col">
                      <p className="text-gray-900 text-lg font-bold">
                        Order {formatDisplayId(sale.id, 'ORD')}
                      </p>
                      <p className="text-gray-500 text-base">
                        {format(new Date(sale.sold_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-900 text-xl font-black">
                        ₱{parseFloat(sale.total_amount.toString()).toFixed(2)}
                      </p>
                      <p className="text-gray-400 text-base capitalize">
                        {sale.payment_method === 'gcash' ? 'GCash' : sale.payment_method || 'N/A'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {showClockModal && (
        <ClockInOutModal
          isOpen={showClockModal}
          onClose={() => setShowClockModal(false)}
          onClockChange={() => {
            // Optional: reload clock status after clock in/out
            loadCurrentSession()
          }}
        />
      )}

      {showSessionModal && (
        <SessionManagementModal
          session={session}
          onClose={() => {
            setShowSessionModal(false)
          }}
          onOpenSession={async () => {
            try {
              const result = await openSession()
              // Real-time subscription will automatically update the session state
              // But we'll reload to ensure we have the latest data
              if (result.success) {
                // Wait a moment for database transaction to commit
                await new Promise((resolve) => setTimeout(resolve, 300))
                await loadCurrentSession()
              } else {
                console.error('Failed to open session:', result.error)
              }
              return result
            } catch (error) {
              console.error('Exception opening session:', error)
              return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to open session'
              }
            }
          }}
          onCloseSession={async (sessionId) => {
            try {
              const result = await closeSession(sessionId)
              // Real-time subscription will automatically update the session state
              // But we'll reload to ensure we have the latest data
              if (result.success) {
                // Wait a moment for database transaction to commit
                await new Promise((resolve) => setTimeout(resolve, 300))
                await loadCurrentSession()
              } else {
                console.error('Failed to close session:', result.error)
              }
              return result
            } catch (error) {
              console.error('Exception closing session:', error)
              return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to close session'
              }
            }
          }}
        />
      )}

      {showGCashModal && session && (
        <GCashPaymentModal
          totalAmount={total}
          onClose={() => {
            setShowGCashModal(false)
            setPaymentMethod('cash') // Reset to cash if modal is closed
          }}
          onConfirm={handleGCashConfirm}
        />
      )}

      {showQueuedSalesModal && (
        <QueuedSalesModal
          isOpen={showQueuedSalesModal}
          onClose={() => {
            setShowQueuedSalesModal(false)
            checkQueuedSalesStatus() // Refresh count when closing
          }}
          onSyncComplete={() => {
            checkQueuedSalesStatus() // Refresh count after sync
            loadOrderHistory() // Refresh order history
          }}
        />
      )}

      {showOrderModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 shadow-lg flex flex-col max-h-[calc(100dvh-2rem)]">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex flex-col">
                <h2 className="text-xl font-semibold text-gray-900">
                  Order {formatDisplayId(selectedOrder.id, 'ORD')}
                </h2>
                <p className="text-sm text-gray-600">
                  {format(new Date(selectedOrder.sold_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowOrderModal(false)
                  setSelectedOrder(null)
                }}
                className="text-gray-500 hover:text-gray-900"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-600">Items</p>
                <ul className="space-y-3">
                  {selectedOrder.sale_items.map((item) => {
                    const product = item.products
                    const itemTotal = item.price * item.quantity
                    return (
                      <li key={item.id} className="flex justify-between items-start">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-3">
                            {product?.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="w-10 h-10 bg-cover bg-center rounded-md object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  target.style.display = 'none'
                                }}
                              />
                            ) : (
                              <div className="w-10 h-10 bg-gradient-to-br from-amber-800 to-amber-600 rounded-md"></div>
                            )}
                            <div>
                              <p className="text-gray-900 font-medium">
                                {product?.name || 'Unknown Product'}
                              </p>
                              <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                            </div>
                          </div>
                          {item.customizations && item.customizations.length > 0 && (
                            <div className="flex flex-wrap gap-1 pl-[52px]">
                              {item.customizations.map((c: any) => (
                                <span key={c.ingredient_id} className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                                  {c.delta > 0 ? '+' : ''}{c.delta} {c.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <p className="text-gray-900 mt-2 font-medium">₱{itemTotal.toFixed(2)}</p>
                      </li>
                    )
                  })}
                </ul>
              </div>
              <div className="space-y-2 pt-4 border-t border-gray-200">
                <div className="flex justify-between text-base font-bold">
                  <span className="text-gray-900">Total</span>
                  <span className="text-gray-900">
                    ₱{parseFloat(selectedOrder.total_amount.toString()).toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm font-medium text-gray-600">Payment</p>
                <p className="text-base text-gray-900 font-medium capitalize">
                  Paid with {selectedOrder.payment_method === 'gcash' ? 'GCash' : selectedOrder.payment_method || 'N/A'}
                </p>
                {selectedOrder.payment_method === 'gcash' && selectedOrder.gcash_reference_code && (
                  <p className="text-sm text-gray-500 font-mono mt-1">
                    Reference: {selectedOrder.gcash_reference_code}
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 bg-gray-50 rounded-b-xl border-t border-gray-200">
              <button
                onClick={() => {
                  // Print receipt functionality
                  window.print()
                }}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-button-gray text-gray-900 text-sm font-medium leading-normal tracking-wide hover:bg-[#D0D0D0] transition-colors border border-gray-200"
              >
                <span className="truncate">Print Receipt</span>
              </button>
              <button
                onClick={() => {
                  // Refund order functionality - placeholder
                  alert('Refund functionality coming soon')
                }}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-button-gray text-gray-900 text-sm font-medium leading-normal tracking-wide hover:bg-[#D0D0D0] transition-colors border border-gray-200"
              >
                <span className="truncate">Refund Order</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {itemToCustomize && (
        <CustomizationModal
          isOpen={!!itemToCustomize}
          productId={itemToCustomize.product.id}
          onClose={() => setItemToCustomize(null)}
          initialCustomizations={itemToCustomize.customizations}
          onSave={(newCustomizations) => {
            setCart(prev => prev.map(item => 
              item.cart_item_id === itemToCustomize.cart_item_id 
                ? { ...item, customizations: newCustomizations } 
                : item
            ))
          }}
        />
      )}
    </div>
  )
}

