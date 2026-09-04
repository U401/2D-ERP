'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'
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
  initialSessions
}: {
  initialLogs: ActivityLog[],
  initialSessions: Session[]
}) {
  const [logs, setLogs] = useState<ActivityLog[]>(initialLogs)
  const [sessions, setSessions] = useState<Session[]>(initialSessions)
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null)
  const [loadingSales, setLoadingSales] = useState(true)
  const supabase = createClient()

  useEffect(() => {
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

    fetchSalesSummary(); fetchRecentLogs(); fetchOpenSessions()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSalesSummary(); fetchRecentLogs(); fetchOpenSessions();
      }
    }

    const handleFocus = () => {
      fetchSalesSummary(); fetchRecentLogs(); fetchOpenSessions();
    }

    window.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    // Polling fallback: Android webview can drop websocket connections
    // when backgrounded. Polling every 15s ensures data is always fresh.
    const pollInterval = setInterval(() => {
      fetchOpenSessions()
      fetchRecentLogs()
      fetchSalesSummary()
    }, 15000)

    const channel = supabase.channel('admin-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        fetchOpenSessions()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => {
        fetchRecentLogs()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
      window.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [supabase])

  const revenueChange = salesSummary?.weeklyRevenue
    ? ((salesSummary.todayRevenue - salesSummary.weeklyRevenue / 7) / (salesSummary.weeklyRevenue / 7)) * 100
    : 0

  return (
    <div className="space-y-5">

      {/* ── Top Revenue Cards ──────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Monthly Revenue */}
        <div className="col-span-2 rounded-2xl bg-white border border-slate-200 p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Monthly Revenue</p>
          <p className="text-4xl font-black mt-2 text-slate-900">
            {loadingSales ? '—' : `₱${salesSummary?.monthlyRevenue.toFixed(2) ?? '0.00'}`}
          </p>
          <p className="text-xs text-slate-500 mt-1">{salesSummary?.monthlyOrders ?? 0} orders this month</p>
        </div>

        {/* Today */}
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
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
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
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
                <div key={i} className="flex-shrink-0 rounded-2xl bg-white border border-slate-200 p-4 min-w-[130px]">
                  <p className="text-xs font-bold text-slate-500 truncate">{store.name}</p>
                  <p className="text-xl font-black text-slate-900 mt-1">₱{store.revenue.toFixed(0)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">this month</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Active Sessions ────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Active Sessions</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sessions.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center">
            <p className="text-sm font-medium text-slate-400">No active sessions</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="flex gap-3 pb-1">
              {sessions.map(session => (
                <div key={session.id} className="flex-shrink-0 rounded-2xl bg-white border border-slate-200 p-4 min-w-[150px]">
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
          <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center">
            <p className="text-sm font-medium text-slate-400">No recent activity</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
            {logs.slice(0, 15).map(log => (
              <div key={log.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-10 h-10 rounded-full bg-input-gray flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-primary text-base">receipt_long</span>
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
    </div>
  )
}
