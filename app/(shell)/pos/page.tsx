'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { openSession, closeSession, getCurrentSession } from '@/app/actions/session'
import { finalizeSale } from '@/app/actions/sales'
import SessionManagementModal from '@/components/modals/SessionManagementModal'
import { format } from 'date-fns'

type Product = {
  id: string
  name: string
  price: number
  category: string
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

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('Hot Coffee')
  const [searchQuery, setSearchQuery] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    loadProducts()
    loadCurrentSession()
  }, [])

  async function loadProducts() {
    const supabase = createClient()
    const { data } = await supabase.from('products').select('*').order('name')
    if (data) setProducts(data)
  }

  async function loadCurrentSession() {
    const result = await getCurrentSession()
    if (result.success && result.session) {
      setSession(result.session as Session)
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

  async function handleFinalizeSale() {
    if (!session || cart.length === 0) return

    setIsProcessing(true)
    try {
      const items = cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.price,
      }))

      const result = await finalizeSale(session.id, items)

      if (result.success) {
        setCart([])
        alert('Sale completed successfully!')
        await loadCurrentSession()
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const categories = Array.from(new Set(products.map((p) => p.category))).filter(Boolean)
  const filteredProducts = products.filter((p) => {
    const matchesCategory = !selectedCategory || p.category === selectedCategory
    const matchesSearch =
      !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  )

  return (
    <div className="flex h-full min-h-screen">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
        {/* Product Grid */}
        <div className="lg:col-span-2 flex flex-col gap-4 h-full">
          {/* Search */}
          <div className="px-4 py-3">
            <label className="flex flex-col min-w-40 h-12 w-full">
              <div className="flex w-full flex-1 items-stretch rounded-lg h-full">
                <div className="text-gray-400 flex border-none bg-gray-900 items-center justify-center pl-4 rounded-l-lg border-r-0">
                  <span className="material-symbols-outlined">search</span>
                </div>
                <input
                  className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-white focus:outline-0 focus:ring-0 border-none bg-gray-900 focus:border-none h-full placeholder:text-gray-500 px-4 rounded-l-none border-l-0 pl-2 text-base font-normal leading-normal"
                  placeholder="Find a product..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </label>
          </div>

          {/* Category Tabs */}
          <div className="border-b border-gray-800 px-4">
            <nav className="flex gap-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex items-center justify-center whitespace-nowrap px-4 py-3 text-sm font-medium rounded-t-lg transition-colors ${
                    selectedCategory === cat
                      ? 'text-white bg-gray-900'
                      : 'text-gray-400 hover:bg-gray-900 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </nav>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-4 p-4 overflow-y-auto flex-1">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="flex flex-col gap-3 pb-3 cursor-pointer rounded-lg bg-[#0a0a0a] hover:bg-gray-900 p-3 transition-colors text-left"
              >
                <div className="w-full bg-center bg-no-repeat aspect-square bg-cover rounded-lg bg-gradient-to-br from-amber-800 to-amber-600"></div>
                <div>
                  <p className="text-white text-base font-medium leading-normal">
                    {product.name}
                  </p>
                  <p className="text-gray-400 text-sm font-normal leading-normal">
                    ${product.price.toFixed(2)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Cart Sidebar */}
        <div className="lg:col-span-1 bg-[#0a0a0a] rounded-xl p-0 flex flex-col">
          {/* Session Banner */}
          <div className="p-4 border-b border-gray-800">
            <button
              onClick={() => setShowSessionModal(true)}
              className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                session?.status === 'open'
                  ? 'bg-green-900/30 text-green-400 border border-green-800'
                  : 'bg-gray-900 text-gray-400 border border-gray-800'
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

          {/* Cart Items */}
          <div className="flex-grow py-4 px-6 space-y-4 overflow-y-auto">
            {cart.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Cart is empty</p>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-center justify-between p-3 bg-gray-900 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">
                      {item.product.name}
                    </p>
                    <p className="text-gray-400 text-xs">
                      ${item.product.price.toFixed(2)} each
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateCartQuantity(item.product.id, -1)}
                      className="w-8 h-8 rounded bg-gray-800 text-white hover:bg-gray-700 flex items-center justify-center"
                    >
                      -
                    </button>
                    <span className="text-white font-medium w-8 text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateCartQuantity(item.product.id, 1)}
                      className="w-8 h-8 rounded bg-gray-800 text-white hover:bg-gray-700 flex items-center justify-center"
                    >
                      +
                    </button>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="ml-2 text-gray-500 hover:text-red-400"
                    >
                      <span className="material-symbols-outlined text-lg">
                        delete
                      </span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Footer */}
          <div className="p-6 border-t border-gray-800 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-lg">Total:</span>
              <span className="text-white text-2xl font-bold">
                ${cartTotal.toFixed(2)}
              </span>
            </div>
            <button
              onClick={handleFinalizeSale}
              disabled={!session || cart.length === 0 || isProcessing}
              className="w-full py-4 bg-white text-black font-bold rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? 'Processing...' : 'Finalize Sale'}
            </button>
          </div>
        </div>
      </div>

      {showSessionModal && (
        <SessionManagementModal
          session={session}
          onClose={() => {
            setShowSessionModal(false)
            loadCurrentSession()
          }}
          onOpenSession={async () => {
            const result = await openSession()
            if (result.success) {
              await loadCurrentSession()
            }
            return result
          }}
          onCloseSession={async (sessionId) => {
            const result = await closeSession(sessionId)
            if (result.success) {
              await loadCurrentSession()
            }
            return result
          }}
        />
      )}
    </div>
  )
}

