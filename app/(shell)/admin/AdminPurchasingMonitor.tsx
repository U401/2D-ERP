'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type OrderStatus = 'pending' | 'received' | 'cancelled'

type PurchasingOrder = {
  id: string
  po_number: string
  status: OrderStatus
  total_amount: number
  created_at: string
  delivery_date: string | null
  store: { name: string } | null
  supplier: { name: string } | null
}

type StoreSummary = {
  storeName: string
  totalOrders: number
  pending: number
  received: number
  cancelled: number
  totalValue: number
}

export default function AdminPurchasingMonitor() {
  const [orders, setOrders] = useState<PurchasingOrder[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function loadOrders() {
      setLoading(true)
      setError(null)

      let query = supabase
        .from('purchase_orders')
        .select(`
          id,
          po_number,
          status,
          total_amount,
          created_at,
          delivery_date,
          store:stores(name),
          supplier:suppliers(name)
        `)
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data, error: queryError } = await query

      if (queryError) {
        setError(queryError.message)
        setOrders([])
        setLoading(false)
        return
      }

      const normalizedOrders: PurchasingOrder[] = ((data || []) as any[]).map((row) => ({
        id: row.id,
        po_number: row.po_number,
        status: row.status as OrderStatus,
        total_amount: Number(row.total_amount || 0),
        created_at: row.created_at,
        delivery_date: row.delivery_date,
        store: Array.isArray(row.store) ? (row.store[0] ?? null) : (row.store ?? null),
        supplier: Array.isArray(row.supplier) ? (row.supplier[0] ?? null) : (row.supplier ?? null),
      }))

      setOrders(normalizedOrders)
      setLoading(false)
    }

    loadOrders()
  }, [statusFilter, supabase])

  const totals = useMemo(() => {
    const pending = orders.filter((o) => o.status === 'pending').length
    const received = orders.filter((o) => o.status === 'received').length
    const cancelled = orders.filter((o) => o.status === 'cancelled').length
    const totalValue = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
    return { pending, received, cancelled, total: orders.length, totalValue }
  }, [orders])

  const storeSummaries = useMemo(() => {
    const byStore = new Map<string, StoreSummary>()

    for (const order of orders) {
      const storeName = order.store?.name || 'Unknown Store'
      if (!byStore.has(storeName)) {
        byStore.set(storeName, {
          storeName,
          totalOrders: 0,
          pending: 0,
          received: 0,
          cancelled: 0,
          totalValue: 0,
        })
      }

      const summary = byStore.get(storeName)!
      summary.totalOrders += 1
      summary.totalValue += Number(order.total_amount || 0)

      if (order.status === 'pending') summary.pending += 1
      if (order.status === 'received') summary.received += 1
      if (order.status === 'cancelled') summary.cancelled += 1
    }

    return Array.from(byStore.values()).sort((a, b) => b.totalOrders - a.totalOrders)
  }, [orders])

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Purchasing Monitor</h2>
            <p className="text-sm text-slate-600 mt-1">Track purchase orders across all stores.</p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | OrderStatus)}
              className="h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">Total Purchasing Value</h3>
        <p className="text-4xl font-black text-slate-900 mt-2">₱{totals.totalValue.toFixed(2)}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Orders" value={`${totals.total}`} accent="border-slate-300" />
        <MetricCard title="Pending" value={`${totals.pending}`} accent="border-yellow-300" />
        <MetricCard title="Received" value={`${totals.received}`} accent="border-green-300" />
        <MetricCard title="Cancelled" value={`${totals.cancelled}`} accent="border-red-300" />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">Couldn&apos;t load purchasing data.</p>
          <p className="mt-1 text-xs text-red-700">Error: {error}</p>
        </div>
      )}

      {loading ? (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500">Loading purchasing monitor...</p>
        </div>
      ) : (
        <>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Store Breakdown</h3>
            {storeSummaries.length === 0 ? (
              <p className="text-sm text-slate-500">No purchase orders found for the selected filter.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {storeSummaries.map((store) => (
                  <div key={store.storeName} className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{store.storeName}</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{store.totalOrders} orders</p>
                    <p className="text-sm text-slate-600 mt-1">₱{store.totalValue.toFixed(2)}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                      <span className="rounded-md bg-yellow-50 border border-yellow-200 px-2 py-1 text-center">P: {store.pending}</span>
                      <span className="rounded-md bg-green-50 border border-green-200 px-2 py-1 text-center">R: {store.received}</span>
                      <span className="rounded-md bg-red-50 border border-red-200 px-2 py-1 text-center">C: {store.cancelled}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Recent Purchase Orders</h3>
            {orders.length === 0 ? (
              <p className="text-sm text-slate-500">No purchase orders to show.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">PO #</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">Store</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">Supplier</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">Status</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-600">Total</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {orders.slice(0, 50).map((order) => (
                      <tr key={order.id}>
                        <td className="px-4 py-2 font-medium text-slate-900">{order.po_number}</td>
                        <td className="px-4 py-2 text-slate-700">{order.store?.name || '-'}</td>
                        <td className="px-4 py-2 text-slate-700">{order.supplier?.name || '-'}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                            order.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : order.status === 'received'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-slate-900">
                          ₱{Number(order.total_amount || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-slate-600">
                          {new Date(order.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function MetricCard({
  title,
  value,
  accent,
}: {
  title: string
  value: string
  accent: string
}) {
  return (
    <div className={`bg-white p-5 border-l-4 ${accent} rounded-xl shadow-sm border border-slate-200`}>
      <p className="text-sm font-semibold uppercase tracking-wider text-slate-600">{title}</p>
      <p className="text-4xl font-black leading-tight text-slate-900 mt-2">{value}</p>
    </div>
  )
}
