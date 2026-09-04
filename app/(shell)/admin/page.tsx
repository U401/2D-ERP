'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminDashboard from './AdminDashboard'
import UserManagement from './UserManagement'
import StoreManagement from './StoreManagement'
import { LiveUserMonitor } from './LiveUserMonitor'
import HRManagement from './HRManagement'
import PayrollPage from '../payroll/page'
import AdminPurchasingMonitor from './AdminPurchasingMonitor'
import AdminReports from './AdminReports'
import AdminInventory from './AdminInventory'
import AdminMenuManagement from './AdminMenuManagement'
import FoodCostingPage from '../reports/costing/page'
import { DebugPanel } from '@/components/DebugPanel'
import { useRouter, useSearchParams } from 'next/navigation'

type TabKey = 'overview' | 'inventory' | 'reports' | 'monitoring' | 'users' | 'stores' | 'hr' | 'payroll' | 'purchasing' | 'menu' | 'costing'

const NAV_TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'home' },
    { key: 'inventory', label: 'Inventory', icon: 'inventory_2' },
    { key: 'menu', label: 'Menu', icon: 'restaurant_menu' },
    { key: 'costing', label: 'Costing', icon: 'request_quote' },
    { key: 'reports', label: 'Reports', icon: 'bar_chart' },
    { key: 'stores', label: 'Stores', icon: 'store' },
    { key: 'users', label: 'Users', icon: 'group' },
    { key: 'hr', label: 'HR', icon: 'badge' },
]

export default function AdminPage() {
    const [loading, setLoading] = useState(true)
    const [authorized, setAuthorized] = useState(false)
    const [initialData, setInitialData] = useState<{ logs: any[], sessions: any[], profiles: any[], stores: any[] }>({ logs: [], sessions: [], profiles: [], stores: [] })

    const router = useRouter()
    const searchParams = useSearchParams()
    const queryTab = searchParams.get('tab') as TabKey | null

    const [tab, setTab] = useState<TabKey>(queryTab || 'overview')
    const supabase = useMemo(() => createClient(), [])

    const handleTabChange = (newTab: TabKey) => {
        if (newTab === 'overview') {
            router.push('/admin/')
        } else {
            router.push(`/admin?tab=${newTab}`)
        }
    }

    useEffect(() => {
        const targetTab = queryTab || 'overview'
        if (targetTab !== tab) {
            setTab(targetTab)
        }
    }, [queryTab, tab])

    useEffect(() => {
        async function checkAuthAndFetchData() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login/')
                return
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single()

            if (profile?.role !== 'admin') {
                setLoading(false)
                return // Not authorized
            }

            setAuthorized(true)

            // Fetch initial data
            const { data: sessionsRaw, error: sessionsError } = await supabase
                .from('sessions')
                .select('id, opened_at, user_id, status')
                .eq('status', 'open')
                .order('opened_at', { ascending: false })

            console.log('Initial sessions fetch:', sessionsRaw, sessionsError)

            // Manual join: sessions.user_id -> profiles.id
            let sessions: any[] = sessionsRaw || []
            if (sessionsRaw && sessionsRaw.length > 0) {
                const userIds = sessionsRaw.map((s: any) => s.user_id).filter(Boolean)
                const { data: profilesForSessions, error: profilesForSessionsError } = await supabase
                    .from('profiles')
                    .select('id, username')
                    .in('id', userIds)

                if (profilesForSessionsError) {
                    console.warn('Failed to fetch profiles for sessions:', profilesForSessionsError)
                }

                sessions = sessionsRaw.map((s: any) => ({
                    ...s,
                    profiles: profilesForSessions?.find((p: any) => p.id === s.user_id) || null,
                }))
            }

            const { data: logsRaw, error: logsError } = await supabase
                .from('activity_logs')
                .select('id, user_id, action_type, details, created_at')
                .order('created_at', { ascending: false })
                .limit(50)

            console.log('Initial logs fetch:', logsRaw, logsError)

            // Manual join: activity_logs.user_id -> profiles.id
            let logs: any[] = logsRaw || []
            if (logsRaw && logsRaw.length > 0) {
                const userIds = logsRaw.map((l: any) => l.user_id).filter(Boolean)
                const { data: profilesForLogs, error: profilesForLogsError } = await supabase
                    .from('profiles')
                    .select('id, username')
                    .in('id', userIds)

                if (profilesForLogsError) {
                    console.warn('Failed to fetch profiles for logs:', profilesForLogsError)
                }

                logs = logsRaw.map((l: any) => ({
                    ...l,
                    profiles: profilesForLogs?.find((p: any) => p.id === l.user_id) || null,
                }))
            }

            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, username, role, store_id, phone')
                .order('username')

            console.log('Initial profiles fetch:', profiles, profilesError)

            // Fetch stores
            const { data: stores, error: storesError } = await supabase
                .from('stores')
                .select('*')
                .order('name')

            console.log('Initial stores fetch:', stores, storesError)

            setInitialData({
                logs: logs || [],
                sessions: sessions || [],
                profiles: profiles || [],
                stores: stores || []
            })
            setLoading(false)
        }

        checkAuthAndFetchData()
    }, [router, supabase])

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    if (!authorized) {
        return (
            <div className="p-8 text-center">
                <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
                <p className="text-slate-600 mt-2">You do not have permission to view this page.</p>
            </div>
        )
    }

    const isHR = tab === 'hr'

    return (
        /* Extra bottom padding on mobile to clear the bottom nav bar */
        <div className="p-4 md:p-8 pb-24 md:pb-8">
            <div className="max-w-7xl mx-auto">
        {!isHR && (
                    <div className="flex items-center justify-between mb-1 md:mb-0 md:flex-col md:gap-4 md:items-start">
                        {/* Mobile: compact title only */}
                        <div className="md:hidden">
                            <h1 className="text-lg font-black text-slate-900">
                                {tab === 'inventory' ? 'Inventory' : tab === 'menu' ? 'Menu' : tab === 'costing' ? 'Food Costing' : tab === 'reports' ? 'Reports' : tab === 'stores' ? 'Stores' : tab === 'users' ? 'Users' : 'Overview'}
                            </h1>
                        </div>

                        {/* Desktop: full title + description */}
                        <div className="hidden md:flex md:flex-row md:items-end md:justify-between w-full">
                            <div>
                                <h1 className="text-4xl font-bold text-slate-900">Admin</h1>
                                <p className="text-base text-slate-600 mt-1">
                                    {tab === 'inventory'
                                        ? 'Monitor stock levels across all stores.'
                                        : tab === 'reports'
                                        ? 'View sales reports and analytics.'
                                        : 'Monitor activity and manage users, stores, and payroll.'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <div className={isHR ? '' : 'mt-5'}>
                    {tab === 'overview' && (
                        <AdminDashboard
                            initialLogs={initialData.logs}
                            initialSessions={initialData.sessions}
                        />
                    )}

                    {tab === 'inventory' && <AdminInventory />}

                    {tab === 'menu' && <AdminMenuManagement />}

                    {tab === 'costing' && <FoodCostingPage />}

                    {tab === 'reports' && <AdminReports stores={initialData.stores} />}

                    {tab === 'stores' && (
                        <StoreManagement
                            initialStores={initialData.stores}
                            initialUsers={initialData.profiles}
                            isAdmin={true}
                        />
                    )}

                    {tab === 'users' && (
                        <UserManagement profiles={initialData.profiles} stores={initialData.stores} />
                    )}

                    {tab === 'hr' && <HRManagement />}

                    {/* tab === 'payroll' && (
                        <PayrollPage initialProfiles={initialData.profiles} />
                    ) */}

                    {/* tab === 'purchasing' && (
                        <AdminPurchasingMonitor />
                    ) */}
                </div>

                <DebugPanel />
            </div>


        </div>
    )
}

function TabButton({
    active,
    onClick,
    children,
}: {
    active: boolean
    onClick: () => void
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`whitespace-nowrap flex-shrink-0 px-4 md:px-5 py-2.5 md:py-3 text-sm md:text-base font-semibold rounded-md transition-colors ${active
                ? 'bg-primary text-white'
                : 'text-slate-700 hover:bg-slate-100'
                }`}
        >
            {children}
        </button>
    )
}

