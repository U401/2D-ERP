'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { openSession, closeSession } from '@/app/actions/session'
import { finalizeSale } from '@/app/actions/sales'
import SessionManagementModal from '@/components/modals/SessionManagementModal'
import GCashPaymentModal from '@/components/modals/GCashPaymentModal'
import { format } from 'date-fns'
import type { GCashVerificationResult } from '@/lib/types/gcash'

type Product = {
  id: string
  name: string
  price: number
  category: string
  image_url: string | null
}

type CartItem = {
  product: Product
  quantity: number
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
  const [selectedCategory, setSelectedCategory] = useState<string>('Hot Coffee')
  const [searchQuery, setSearchQuery] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState<'order' | 'history'>('order')
  const [orderHistory, setOrderHistory] = useState<Sale[]>([])
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'gcash'>('cash')
  const [showGCashModal, setShowGCashModal] = useState(false)
  const [taxRate] = useState(0.08) // 8% tax rate
  const [selectedOrder, setSelectedOrder] = useState<Sale | null>(null)
  const [showOrderModal, setShowOrderModal] = useState(false)

  useEffect(() => {
    loadProducts()
    loadCurrentSession()
  }, [])

  useEffect(() => {
    if (activeTab === 'history') {
      // Always refresh history when switching to history tab
      loadOrderHistory()
    }
  }, [activeTab])

  async function loadProducts() {
    const supabase = createClient()
    const { data } = await supabase.from('products').select('*').order('name')
    if (data) setProducts(data)
  }

  async function loadCurrentSession() {
    // Query directly from client to get most up-to-date data
    const supabase = createClient()
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('status', 'open')
      .single()

    if (error && error.code !== 'PGRST116') {
      // Error other than "not found" - set to null
      setSession(null)
    } else if (data) {
      setSession(data as Session)
    } else {
      // No open session found
      setSession(null)
    }
  }

  async function loadOrderHistory() {
    const supabase = createClient()
    // Load all sales including GCash transactions - no payment method filter
    // Ensure we get all payment methods: cash, card, and gcash
    const { data, error } = await supabase
      .from('sales')
      .select('*, sale_items(*, products(id, name, image_url))')
      .order('sold_at', { ascending: false })
      .limit(20)
    
    if (error) {
      console.error('Error loading order history:', error)
      return
    }
    
    if (data) {
      console.log('Loaded order history:', {
        totalSales: data.length,
        paymentMethods: data.map(s => s.payment_method),
        gcashSales: data.filter(s => s.payment_method === 'gcash').length,
      })
      setOrderHistory(data as Sale[])
    }
  }

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
  }

  function updateCartQuantity(productId: string, delta: number) {
    setCart((prev) => {
      const item = prev.find((i) => i.product.id === productId)
      if (!item) return prev

      const newQuantity = item.quantity + delta
      if (newQuantity <= 0) {
        return prev.filter((i) => i.product.id !== productId)
      }

      return prev.map((i) =>
        i.product.id === productId ? { ...i, quantity: newQuantity } : i
      )
    })
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((item) => item.product.id !== productId))
  }

  async function handleFinalizeSale(gcashData?: {
    referenceCode: string
    transactionTimestamp: Date
    imageUrl: string | null
  }): Promise<{ success: boolean; error?: string }> {
    if (!session || cart.length === 0) {
      return { success: false, error: 'Session not open or cart is empty' }
    }

    setIsProcessing(true)
    try {
      const items = cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.price,
      }))

      const result = await finalizeSale(
        session.id,
        items,
        paymentMethod,
        paymentMethod === 'gcash' ? gcashData : undefined
      )

      if (result.success) {
        setCart([])
        setPaymentMethod('cash') // Reset to default
        setShowGCashModal(false)
        alert('Sale completed successfully!')
        await loadCurrentSession()
        // Always refresh history so it's up-to-date when user switches to history tab
        // Add delay to ensure database transaction has committed
        await new Promise(resolve => setTimeout(resolve, 500))
        await loadOrderHistory()
        return { success: true }
      } else {
        alert(`Error: ${result.error}`)
        return { success: false, error: result.error || 'Unknown error' }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert(`Error: ${errorMessage}`)
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

  const subtotal = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  )
  const tax = subtotal * taxRate
  const total = subtotal + tax

  return (
    <div className="flex min-h-screen">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
        {/* Product Grid */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Search */}
          <div className="px-4 py-3 flex items-center gap-4">
            <label className="flex flex-col min-w-40 h-12 w-full">
              <div className="flex w-full flex-1 items-stretch rounded-lg h-full">
                <div className="text-gray-400 flex border-none bg-input-gray items-center justify-center pl-4 rounded-l-lg border-r-0">
                  <span className="material-symbols-outlined">search</span>
                </div>
                <input
                  className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-gray-900 focus:outline-0 focus:ring-0 border-none bg-input-gray focus:border-none h-full placeholder:text-gray-500 px-4 rounded-l-none border-l-0 pl-2 text-base font-normal leading-normal"
                  placeholder="Find a product..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </label>
            <button
              onClick={() => window.location.href = '/menu'}
              className="flex items-center justify-center gap-2 h-12 px-4 bg-button-gray text-gray-900 rounded-lg hover:bg-[#D0D0D0] transition-colors flex-shrink-0 border border-gray-200"
            >
              <span className="material-symbols-outlined">edit</span>
              <span className="text-sm font-medium">Manage Products</span>
            </button>
          </div>

          {/* Category Tabs */}
          <div className="border-b border-gray-200 px-4">
            <nav className="flex gap-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex items-center justify-center whitespace-nowrap px-4 py-3 text-sm font-medium rounded-t-lg transition-colors ${
                    selectedCategory === cat
                      ? 'text-gray-900 bg-gray-100'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </nav>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-4 p-4">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="flex flex-col gap-3 pb-3 cursor-pointer rounded-lg bg-white border border-gray-200 hover:bg-gray-50 p-3 transition-colors text-left"
              >
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full aspect-square object-cover rounded-lg"
                    onError={(e) => {
                      // Fallback to placeholder if image fails to load
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                      target.nextElementSibling?.classList.remove('hidden')
                    }}
                  />
                ) : null}
                <div
                  className={`w-full bg-center bg-no-repeat aspect-square bg-cover rounded-lg bg-gradient-to-br from-amber-800 to-amber-600 ${
                    product.image_url ? 'hidden' : ''
                  }`}
                ></div>
                <div>
                  <p className="text-gray-900 text-base font-medium leading-normal">
                    {product.name}
                  </p>
                  <p className="text-gray-600 text-sm font-normal leading-normal">
                    ${product.price.toFixed(2)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Cart Sidebar */}
        <div className="lg:col-span-1 bg-white border border-gray-200 rounded-xl p-0 flex flex-col">
          {/* Session Banner */}
          <div className="p-4 border-b border-gray-200">
            <button
              onClick={() => setShowSessionModal(true)}
              className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                session?.status === 'open'
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-gray-100 text-gray-600 border border-gray-200'
              }`}
            >
              {session?.status === 'open' ? (
                <span>
                  Session Open • {format(new Date(session.opened_at), 'h:mm a')}
                </span>
              ) : (
                'Session Closed'
              )}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex flex-col border-b border-gray-200">
            <div className="flex flex-wrap justify-between gap-3 p-6 pb-0">
              <nav className="flex gap-1">
                <button
                  onClick={() => setActiveTab('order')}
                  className={`flex items-center justify-center whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'order'
                      ? 'text-gray-900 border-gray-900'
                      : 'text-gray-600 border-transparent hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  Order
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex items-center justify-center whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'history'
                      ? 'text-gray-900 border-gray-900'
                      : 'text-gray-600 border-transparent hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  History
                </button>
              </nav>
            </div>
          </div>

          {activeTab === 'order' ? (
            <>
              {/* Cart Items */}
              <div className="flex-grow py-4 px-6 space-y-4 overflow-y-auto">
                {cart.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">Cart is empty</p>
                ) : (
                  cart.map((item) => {
                    const lineTotal = item.product.price * item.quantity
                    return (
                      <div
                        key={item.product.id}
                        className="flex items-center gap-4"
                      >
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
                        <div className="flex-1 flex flex-col">
                          <p className="text-gray-900 text-base font-medium">
                            {item.product.name}
                          </p>
                          <p className="text-gray-600 text-sm">
                            ${item.product.price.toFixed(2)}
                          </p>
                        </div>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const qty = parseInt(e.target.value) || 1
                            if (qty > 0) {
                              const delta = qty - item.quantity
                              updateCartQuantity(item.product.id, delta)
                            }
                          }}
                          className="form-input w-16 text-center bg-input-gray text-gray-900 rounded-md border border-gray-300 focus:ring-2 focus:ring-gray-900"
                        />
                        <p className="text-gray-900 w-20 text-right text-base font-medium">
                          ${lineTotal.toFixed(2)}
                        </p>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-gray-500 hover:text-gray-900"
                        >
                          <span className="material-symbols-outlined">cancel</span>
                        </button>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Cart Footer */}
              <div className="p-6 pt-4 border-t border-gray-200 space-y-4">
                <div className="space-y-2 text-base">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Tax ({Math.round(taxRate * 100)}%)</span>
                    <span>${tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-900 font-bold">
                    <span>Total</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Payment Method Selection */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setPaymentMethod('cash')}
                    className={`flex items-center justify-center h-10 px-2 rounded-lg text-sm font-bold tracking-wide transition-colors border ${
                      paymentMethod === 'cash'
                        ? 'bg-gray-800 text-white border-gray-800'
                        : 'bg-button-gray text-gray-900 hover:bg-[#D0D0D0] border-gray-200'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base mr-1">payments</span>
                    <span>Cash</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('card')}
                    className={`flex items-center justify-center h-10 px-2 rounded-lg text-sm font-bold tracking-wide transition-colors border ${
                      paymentMethod === 'card'
                        ? 'bg-gray-800 text-white border-gray-800'
                        : 'bg-button-gray text-gray-900 hover:bg-[#D0D0D0] border-gray-200'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base mr-1">credit_card</span>
                    <span>Card</span>
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
                    className={`flex items-center justify-center h-10 px-2 rounded-lg text-sm font-bold tracking-wide transition-colors border ${
                      paymentMethod === 'gcash'
                        ? 'bg-gray-800 text-white border-gray-800'
                        : 'bg-button-gray text-gray-900 hover:bg-[#D0D0D0] border-gray-200'
                    } ${!session || cart.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className="material-symbols-outlined text-base mr-1">qr_code_scanner</span>
                    <span>GCash</span>
                  </button>
                </div>

                <button
                  onClick={() => {
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
                      handleFinalizeSale()
                    }
                  }}
                  disabled={!session || cart.length === 0 || isProcessing}
                  className="w-full flex items-center justify-center h-12 px-4 rounded-lg bg-button-gray text-gray-900 text-sm font-bold tracking-wide hover:bg-[#D0D0D0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-gray-200"
                >
                  {isProcessing ? 'Processing...' : `Charge $${total.toFixed(2)}`}
                </button>

                <button
                  onClick={() => {
                    setCart([])
                    setPaymentMethod('cash') // Reset to default
                  }}
                  disabled={cart.length === 0}
                  className="w-full flex items-center justify-center h-10 px-4 rounded-lg text-gray-600 text-sm font-medium tracking-wide hover:bg-button-gray hover:text-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
                >
                  Clear Cart
                </button>
              </div>
            </>
          ) : (
            <div className="flex-grow py-4 px-6 space-y-4 overflow-y-auto">
              {orderHistory.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No order history</p>
              ) : (
                orderHistory.map((sale) => {
                  // Calculate tax and total with tax (same as order tab)
                  const subtotal = parseFloat(sale.total_amount.toString())
                  const saleTax = subtotal * taxRate
                  const totalWithTax = subtotal + saleTax
                  
                  return (
                    <div
                      key={sale.id}
                      onClick={() => {
                        setSelectedOrder(sale)
                        setShowOrderModal(true)
                      }}
                      className="flex justify-between items-center py-3 border-b border-gray-200 cursor-pointer hover:bg-gray-50 px-2 -mx-2 rounded-lg transition-colors"
                    >
                      <div className="flex flex-col">
                        <p className="text-gray-900 text-sm font-medium">
                          Order #{sale.id.slice(0, 8)}
                        </p>
                        <p className="text-gray-600 text-xs">
                          {format(new Date(sale.sold_at), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-900 text-base font-semibold">
                          ${totalWithTax.toFixed(2)}
                        </p>
                        <p className="text-gray-500 text-xs capitalize">
                          {sale.payment_method === 'gcash' ? 'GCash' : sale.payment_method || 'N/A'}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      {showSessionModal && (
        <SessionManagementModal
          session={session}
          onClose={() => {
            setShowSessionModal(false)
          }}
          onOpenSession={async () => {
            const result = await openSession()
            if (result.success) {
              // Wait a moment for database to update, then reload session
              await new Promise((resolve) => setTimeout(resolve, 100))
              await loadCurrentSession()
            }
            return result
          }}
          onCloseSession={async (sessionId) => {
            const result = await closeSession(sessionId)
            if (result.success) {
              // Wait a moment for database to update, then reload session
              await new Promise((resolve) => setTimeout(resolve, 100))
              await loadCurrentSession()
            }
            return result
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

      {showOrderModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 shadow-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex flex-col">
                <h2 className="text-xl font-semibold text-gray-900">
                  Order #{selectedOrder.id.slice(0, 8)}
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
                      <li key={item.id} className="flex justify-between items-center">
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
                        <p className="text-gray-900">${itemTotal.toFixed(2)}</p>
                      </li>
                    )
                  })}
                </ul>
              </div>
              <div className="space-y-2 pt-4 border-t border-gray-200">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="text-gray-900">
                    ${selectedOrder.total_amount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax ({Math.round(taxRate * 100)}%)</span>
                  <span className="text-gray-900">
                    ${(selectedOrder.total_amount * taxRate).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <span className="text-gray-900">Total</span>
                  <span className="text-gray-900">
                    ${(selectedOrder.total_amount * (1 + taxRate)).toFixed(2)}
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
    </div>
  )
}

