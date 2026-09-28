'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, formatDistanceToNow } from 'date-fns'
import { formatDisplayId } from '@/lib/utils/display-id'

type ActivityLog = {
  id: string
  user_id: string
  action_type: string
  details: any
  created_at: string
  profiles: { username: string }
}

type Session = {
  id: string
  opened_at: string
  user_id: string
  profiles: { username: string }
}

type Store = {
  id: string
  name: string
}

type SaleTransaction = {
  id: string
  sold_at: string
  total_amount: number | string
  payment_method: string | null
  status?: string | null
  store_id: string
  stores?: { id: string; name: string } | null
  gcash_reference_code?: string | null
  gcash_transaction_timestamp_utc?: string | null
  sale_items: Array<{
    id: string
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

type SalesSummary = {
  todayRevenue: number
  todayOrders: number
  todayAvgOrder: number
  weeklyRevenue: number
  weeklyOrders: number
  monthlyRevenue: number
  monthlyOrders: number
  monthlyStores: { name: string; revenue: number; dailyRevenue: number }[]
}

export default function AdminDashboard({
  initialLogs,
  initialSessions,
  initialStores = []
}: {
  initialLogs: ActivityLog[]
  initialSessions: Session[]
  initialStores?: Store[]
}) {
  const [logs, setLogs] = useState<ActivityLog[]>(initialLogs)
  const [sessions, setSessions] = useState<Session[]>(initialSessions)
  const [stores, setStores] = useState<Store[]>(initialStores)
  const [salesList, setSalesList] = useState<SaleTransaction[]>([])
  const [loadingSalesList, setLoadingSalesList] = useState(true)
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('all')
  const [selectedSale, setSelectedSale] = useState<SaleTransaction | null>(null)
  const [salesPage, setSalesPage] = useState(1)
  const salesPerPage = 10

  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null)
  const [loadingSales, setLoadingSales] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function fetchStores() {
      if (stores.length === 0) {
        const { data } = await supabase.from('stores').select('id, name').order('name')
        if (data && data.length > 0) {
          setStores(data)
        }
      }
    }

    async function fetchRecentLogs() {
      const { data: logsRaw, error } = await supabase
        .from('activity_logs')
        .select('id, user_id, action_type, details, created_at')
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) return
      if (!logsRaw || logsRaw.length === 0) { setLogs([]); return }
      const userIds = logsRaw.map((l: any) => l.user_id).filter(Boolean)
      const { data: profilesData } = await supabase.from('profiles').select('id, username').in('id', userIds)
      setLogs(logsRaw.map((l: any) => ({ ...l, profiles: profilesData?.find((p: any) => p.id === l.user_id) || null })) as any)
    }

    async function fetchOpenSessions() {
      const { data: sessionsRaw, error } = await supabase
        .from('sessions').select('id, opened_at, user_id, status').eq('status', 'open').order('opened_at', { ascending: false })
      if (error) return
      if (!sessionsRaw || sessionsRaw.length === 0) { setSessions([]); return }
      const userIds = sessionsRaw.map((s: any) => s.user_id).filter(Boolean)
      const { data: profilesData } = await supabase.from('profiles').select('id, username').in('id', userIds)
      setSessions(sessionsRaw.map((s: any) => ({ ...s, profiles: profilesData?.find((p: any) => p.id === s.user_id) || null })) as any)
    }

    async function fetchRecentSales() {
      try {
        const { data, error } = await supabase
          .from('sales')
          .select('*, stores(id, name), sale_items(*, products(id, name, image_url))')
          .order('sold_at', { ascending: false })
          .limit(100)

        if (error) {
          console.error('Error fetching sales:', error)
          return
        }
        setSalesList((data as any) || [])
      } catch (err) {
        console.error('Error in fetchRecentSales:', err)
      } finally {
        setLoadingSalesList(false)
      }
    }

    async function fetchSalesSummary() {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - 7)
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

      const [{ data: todaySales }, { data: weekSales }, { data: monthSales }] = await Promise.all([
        supabase.from('sales').select('total_amount').gte('sold_at', startOfDay.toISOString()).lte('sold_at', now.toISOString()),
        supabase.from('sales').select('total_amount').gte('sold_at', startOfWeek.toISOString()).lte('sold_at', now.toISOString()),
        supabase.from('sales').select('*, stores(name)').gte('sold_at', startOfMonth.toISOString()).lte('sold_at', now.toISOString()),
      ])

      const todayRevenue = (todaySales || []).reduce((s, x) => s + parseFloat(x.total_amount.toString()), 0)
      const todayOrders = (todaySales || []).length
      const weeklyRevenue = (weekSales || []).reduce((s, x) => s + parseFloat(x.total_amount.toString()), 0)
      const monthlyRevenue = (monthSales || []).reduce((s, x) => s + parseFloat(x.total_amount.toString()), 0)
      const monthlyOrders = (monthSales || []).length

      const storeMap: Record<string, number> = {}
      ;(monthSales || []).forEach((s: any) => {
        const name = s.stores?.name || 'Unknown'
        storeMap[name] = (storeMap[name] || 0) + parseFloat(s.total_amount.toString())
      })
      const monthlyStores = Object.entries(storeMap).map(([name, revenue]) => ({ name, revenue, dailyRevenue: 0 })).sort((a, b) => b.revenue - a.revenue)

      setSalesSummary({ todayRevenue, todayOrders, todayAvgOrder: todayOrders > 0 ? todayRevenue / todayOrders : 0, weeklyRevenue, weeklyOrders: (weekSales || []).length, monthlyRevenue, monthlyOrders, monthlyStores })
      setLoadingSales(false)
    }

    fetchStores()
    fetchSalesSummary()
    fetchRecentLogs()
    fetchOpenSessions()
    fetchRecentSales()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSalesSummary()
        fetchRecentLogs()
        fetchOpenSessions()
        fetchRecentSales()
      }
    }

    const handleFocus = () => {
      fetchSalesSummary()
      fetchRecentLogs()
      fetchOpenSessions()
      fetchRecentSales()
    }

    window.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    // Polling fallback: Android webview can drop websocket connections
    // when backgrounded. Polling every 15s ensures data is always fresh.
    const pollInterval = setInterval(() => {
      fetchOpenSessions()
      fetchRecentLogs()
      fetchSalesSummary()
      fetchRecentSales()
    }, 15000)

    const channel = supabase.channel('admin-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        fetchOpenSessions()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => {
        fetchRecentLogs()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        fetchRecentSales()
        fetchSalesSummary()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
      window.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [supabase, stores.length])

  // Count transactions per store for badges
  const storeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: salesList.length }
    salesList.forEach((s) => {
      if (s.store_id) {
        counts[s.store_id] = (counts[s.store_id] || 0) + 1
      }
    })
    return counts
  }, [salesList])

  // Filter sales based on selected store
  const filteredSales = useMemo(() => {
    if (selectedStoreFilter === 'all') return salesList
    return salesList.filter((s) => s.store_id === selectedStoreFilter)
  }, [salesList, selectedStoreFilter])

  const totalPages = Math.ceil(filteredSales.length / salesPerPage) || 1
  const paginatedSales = useMemo(() => {
    return filteredSales.slice((salesPage - 1) * salesPerPage, salesPage * salesPerPage)
  }, [filteredSales, salesPage, salesPerPage])

  useEffect(() => {
    setSalesPage(1)
  }, [selectedStoreFilter])

  const revenueChange = salesSummary?.weeklyRevenue
    ? ((salesSummary.todayRevenue - salesSummary.weeklyRevenue / 7) / (salesSummary.weeklyRevenue / 7)) * 100
    : 0

  return (
    <div className="space-y-6">

      {/* ── Top Revenue Cards ──────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Monthly Revenue */}
        <div className="col-span-2 rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Monthly Revenue</p>
          <p className="text-4xl font-black mt-2 text-slate-900">
            {loadingSales ? '—' : `₱${salesSummary?.monthlyRevenue.toFixed(2) ?? '0.00'}`}
          </p>
          <p className="text-xs text-slate-500 mt-1">{salesSummary?.monthlyOrders ?? 0} orders this month</p>
        </div>

        {/* Today */}
        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Today</p>
          <p className={`text-2xl font-black mt-1 ${revenueChange > 0 ? 'text-emerald-600' : revenueChange < 0 ? 'text-red-500' : 'text-slate-900'}`}>
            {loadingSales ? '—' : `₱${salesSummary?.todayRevenue.toFixed(0) ?? '0'}`}
          </p>
          {!loadingSales && salesSummary?.weeklyRevenue && salesSummary.weeklyRevenue > 0 && (
            <p className={`text-[10px] font-semibold mt-1 ${revenueChange > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {revenueChange > 0 ? '↑' : '↓'} {Math.abs(revenueChange).toFixed(1)}% vs avg
            </p>
          )}
        </div>

        {/* Top Store */}
        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Top Store</p>
          <p className="text-base font-black mt-1 text-slate-900 truncate">
            {loadingSales ? '—' : salesSummary?.monthlyStores[0]?.name ?? 'N/A'}
          </p>
          {salesSummary?.monthlyStores[0]?.revenue && (
            <p className="text-[10px] text-slate-400 mt-0.5">
              ₱{salesSummary.monthlyStores[0].revenue.toFixed(0)} this month
            </p>
          )}
        </div>
      </div>

      {/* ── Store Breakdown ────────────────────── */}
      {salesSummary && salesSummary.monthlyStores.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Store Breakdown</p>
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="flex gap-3 pb-1">
              {salesSummary.monthlyStores.map((store, i) => (
                <div key={i} className="flex-shrink-0 rounded-2xl bg-white border border-slate-200 p-4 min-w-[130px] shadow-sm">
                  <p className="text-xs font-bold text-slate-500 truncate">{store.name}</p>
                  <p className="text-xl font-black text-slate-900 mt-1">₱{store.revenue.toFixed(0)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">this month</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Transaction History (with Store Toggle) ──────────────────── */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-700 text-xl">receipt_long</span>
              <h2 className="text-base sm:text-lg font-black text-slate-900">Transaction History</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Real-time order logs and receipts</p>
          </div>

          {/* Store Toggle Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none max-w-full">
            <button
              type="button"
              onClick={() => setSelectedStoreFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedStoreFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Stores ({storeCounts['all'] || 0})
            </button>
            {stores.map((s) => {
              const count = storeCounts[s.id] || 0
              const isActive = selectedStoreFilter === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStoreFilter(s.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {s.name} ({count})
                </button>
              )
            })}
          </div>
        </div>

        {/* Transaction List */}
        {loadingSalesList ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-semibold">Loading transactions...</p>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
            <span className="material-symbols-outlined text-slate-300 text-4xl mb-1">receipt</span>
            <p className="text-sm font-bold text-slate-600">No transactions found</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {selectedStoreFilter === 'all'
                ? 'No transactions recorded yet.'
                : 'No orders recorded for this store.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
            {paginatedSales.map((sale) => {
              const itemCount = (sale.sale_items || []).reduce((sum, item) => sum + (item.quantity || 1), 0)
              const firstItem = sale.sale_items?.[0]?.products?.name || 'Item'
              const itemSummary = itemCount > 1
                ? `${sale.sale_items?.[0]?.quantity || 1}x ${firstItem} + ${itemCount - 1} more`
                : `${sale.sale_items?.[0]?.quantity || 1}x ${firstItem}`

              return (
                <div
                  key={sale.id}
                  onClick={() => setSelectedSale(sale)}
                  className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-slate-50/80 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center flex-shrink-0 text-slate-700 transition-colors">
                      <span className="material-symbols-outlined text-lg">receipt</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">
                          Order #{formatDisplayId(sale.id, 'ORD')}
                        </span>
                        {sale.status === 'refunded' ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded-full">
                            Refunded
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full">
                            Completed
                          </span>
                        )}
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600 rounded-full truncate max-w-[120px]">
                          {sale.stores?.name || 'Store'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                        <span className="text-slate-400 font-medium">
                          {format(new Date(sale.sold_at), 'MMM d, h:mm a')}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-600 truncate max-w-[200px] sm:max-w-xs">{itemSummary}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0 text-right">
                    <div>
                      <p className="text-base sm:text-lg font-black text-slate-900">
                        ₱{parseFloat(sale.total_amount.toString()).toFixed(2)}
                      </p>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {sale.payment_method === 'gcash' ? 'GCash' : sale.payment_method || 'Cash'}
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-slate-400 group-hover:text-slate-900 transition-colors text-lg">
                      chevron_right
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <p className="text-slate-500 font-medium">
              Showing {(salesPage - 1) * salesPerPage + 1}–{Math.min(salesPage * salesPerPage, filteredSales.length)} of {filteredSales.length}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSalesPage((p) => Math.max(1, p - 1))}
                disabled={salesPage === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setSalesPage((p) => Math.min(totalPages, p + 1))}
                disabled={salesPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Active Sessions ────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Active Sessions</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sessions.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center bg-white">
            <p className="text-sm font-medium text-slate-400">No active sessions</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="flex gap-3 pb-1">
              {sessions.map(session => (
                <div key={session.id} className="flex-shrink-0 rounded-2xl bg-white border border-slate-200 p-4 min-w-[150px] shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <p className="text-xs font-bold text-emerald-600">Active</p>
                  </div>
                  <p className="text-sm font-bold text-slate-900 truncate">{session.profiles?.username || 'Unknown'}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{formatDistanceToNow(new Date(session.opened_at), { addSuffix: true })}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Activity Feed ──────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Recent Activity</p>

        {logs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center bg-white">
            <p className="text-sm font-medium text-slate-400">No recent activity</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden shadow-sm">
            {logs.slice(0, 15).map(log => (
              <div key={log.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-slate-700 text-base">receipt_long</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-slate-900 truncate">{log.profiles?.username || 'Unknown'}</p>
                  <p className="text-xs text-slate-500 truncate">{log.action_type}</p>
                </div>
                <p className="text-xs font-medium text-slate-400 flex-shrink-0 text-right">
                  {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Transaction Detail Modal ──────────────────────── */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-slate-900">
                    Order #{formatDisplayId(selectedSale.id, 'ORD')}
                  </h3>
                  {selectedSale.status === 'refunded' ? (
                    <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded-full">
                      Refunded
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-700 rounded-full">
                      Completed
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {format(new Date(selectedSale.sold_at), 'MMMM d, yyyy h:mm a')} • {selectedSale.stores?.name || 'Store'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">Purchased Items</p>
                <ul className="divide-y divide-slate-100">
                  {(selectedSale.sale_items || []).map((item) => {
                    const product = item.products
                    const itemTotal = (item.price || 0) * (item.quantity || 1)
                    return (
                      <li key={item.id} className="py-3 flex justify-between items-start gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {product?.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-10 h-10 rounded-lg object-cover bg-slate-100 flex-shrink-0"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement
                                target.style.display = 'none'
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-800 to-amber-600 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">
                              {product?.name || 'Product'}
                            </p>
                            <p className="text-xs text-slate-500">
                              Qty: {item.quantity} × ₱{parseFloat(item.price.toString()).toFixed(2)}
                            </p>
                            {item.customizations && item.customizations.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.customizations.map((c: any, ci: number) => (
                                  <span key={ci} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                                    {c.delta > 0 ? '+' : ''}{c.delta} {c.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-black text-slate-900 mt-1 flex-shrink-0">
                          ₱{itemTotal.toFixed(2)}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {/* Total Summary */}
              <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-base font-black">
                <span className="text-slate-900">Total Amount</span>
                <span className="text-slate-900 text-xl">
                  ₱{parseFloat(selectedSale.total_amount.toString()).toFixed(2)}
                </span>
              </div>

              {/* Payment Details */}
              <div className="pt-3 border-t border-slate-100 bg-slate-50/80 rounded-xl p-3.5 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Info</p>
                <div className="flex justify-between items-center text-sm font-semibold text-slate-800">
                  <span>Method</span>
                  <span className="capitalize">{selectedSale.payment_method === 'gcash' ? 'GCash' : selectedSale.payment_method || 'Cash'}</span>
                </div>
                {selectedSale.payment_method === 'gcash' && selectedSale.gcash_reference_code && (
                  <div className="flex justify-between items-center text-xs text-slate-600 font-mono pt-1">
                    <span>Reference</span>
                    <span>{selectedSale.gcash_reference_code}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => alert('Printing is only available on the desktop app.')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors shadow-sm"
              >
                Print Receipt
              </button>
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
