'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/utils/activity-log'
import { getInstanceId } from '@/lib/utils/instance-id'

type SidebarProps = {
    className?: string
    onNavigate?: () => void
    forceExpanded?: boolean
}

function NavCategory({ 
    label, 
    icon, 
    children, 
    defaultOpen = true, 
    isCollapsed = false 
}: { 
    label: string
    icon: string
    children: React.ReactNode
    defaultOpen?: boolean
    isCollapsed?: boolean 
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen)

    return (
        <div className={`flex flex-col ${isCollapsed ? 'mb-2' : 'mb-3'}`}>
            {!isCollapsed ? (
                <button 
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors w-full text-left group"
                >
                    <div className="flex items-center gap-2.5 text-slate-700 group-hover:text-black transition-colors">
                        <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:text-slate-700">{icon}</span>
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 group-hover:text-slate-800">{label}</span>
                    </div>
                    <span className={`material-symbols-outlined text-slate-400 text-[18px] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                        expand_more
                    </span>
                </button>
            ) : (
                <div className="w-8 h-px bg-slate-200 mx-auto my-2" />
            )}
            <div className={isCollapsed ? 'block' : `grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                    <div className={`flex flex-col gap-1.5 ${isCollapsed ? 'items-center' : 'pl-2 ml-3 border-l-2 border-slate-100'}`}>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function Sidebar({ className = '', onNavigate, forceExpanded = false }: SidebarProps) {
    const pathname = usePathname()
    const router = useRouter()
    const searchParams = useSearchParams()
    const currentTab = searchParams.get('tab')
    const [isAdmin, setIsAdmin] = useState(false)
    const [username, setUsername] = useState<string>('')
    const [storeName, setStoreName] = useState<string>('')
    
    // Internal collapse state with role awareness
    const [collapsedInternal, setCollapsedInternal] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            const isPos = window.location.pathname.startsWith('/pos')
            const storageKey = isPos ? 'erp_sidebar_collapsed_staff' : 'erp_sidebar_collapsed_admin'
            const saved = localStorage.getItem(storageKey)
            if (saved !== null) return saved === 'true'
            // Default: staff/pos is collapsed (true), admin is expanded (false)
            return isPos
        }
        return false
    })

    const isCollapsed = forceExpanded ? false : collapsedInternal

    const toggleCollapsed = () => {
        const next = !collapsedInternal
        setCollapsedInternal(next)
        if (typeof window !== 'undefined') {
            const storageKey = isAdmin ? 'erp_sidebar_collapsed_admin' : 'erp_sidebar_collapsed_staff'
            localStorage.setItem(storageKey, String(next))
        }
    }
    
    const supabase = createClient()

    async function checkUser() {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('username, role, store_id')
                .eq('id', user.id)
                .single()

            if (profile) {
                const userIsAdmin = profile.role === 'admin'
                setUsername(profile.username)
                setIsAdmin(userIsAdmin)

                // If user hasn't explicitly set a preference in localStorage, apply default:
                // Admin -> expanded (false), Staff -> collapsed (true)
                if (typeof window !== 'undefined') {
                    const storageKey = userIsAdmin ? 'erp_sidebar_collapsed_admin' : 'erp_sidebar_collapsed_staff'
                    const saved = localStorage.getItem(storageKey)
                    if (saved !== null) {
                        setCollapsedInternal(saved === 'true')
                    } else {
                        setCollapsedInternal(!userIsAdmin)
                    }
                }

                if (userIsAdmin) {
                    setStoreName('')
                } else if (profile.store_id) {
                    const { data: store } = await supabase
                        .from('stores')
                        .select('name')
                        .eq('id', profile.store_id)
                        .single()
                    setStoreName(store?.name || '')
                }
            }
        }
    }

    useEffect(() => {
        checkUser()
    }, [supabase])

    const normalizePath = (p: string) => (p.endsWith('/') ? p : `${p}/`)
    const isActive = (path: string) => {
        const a = normalizePath(pathname || '/')
        const b = normalizePath(path)
        return a === b
    }

    async function handleLogout() {
        await logActivity('logout')
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const instanceId = getInstanceId()
                await supabase
                    .from('user_active_logins')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('instance_id', instanceId)

                await supabase.from('user_presence').upsert({
                    user_id: user.id,
                    status: 'offline',
                    current_page: 'logout',
                    last_seen: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
            }
        } catch {
            // ignore
        }
        await supabase.auth.signOut()
        router.push('/login/')
        onNavigate?.()
    }

    // Helper component for links to keep it DRY
    const NavLink = ({ href, icon, label, active }: { href: string, icon: string, label: string, active: boolean }) => (
        <Link
            href={href}
            title={label}
            onClick={() => onNavigate?.()}
            className={`transition-all ${
                isCollapsed
                    ? `flex flex-col items-center justify-center py-2 px-1 rounded-xl w-full ${
                        active 
                            ? 'bg-slate-900 text-white shadow-sm' 
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`
                    : `flex items-center gap-3 px-3 py-2.5 rounded-xl w-full ${
                        active 
                            ? 'bg-slate-900 text-white font-bold shadow-sm' 
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium'
                      }`
            }`}
        >
            <span 
                className="material-symbols-outlined shrink-0" 
                style={{ 
                    fontSize: isCollapsed ? '20px' : '22px', 
                    fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" 
                }}
            >
                {icon}
            </span>
            {isCollapsed ? (
                <span className="text-[10px] font-semibold text-center leading-tight truncate max-w-[72px] mt-0.5 tracking-tight">
                    {label}
                </span>
            ) : (
                <span className="text-sm font-semibold leading-relaxed truncate">{label}</span>
            )}
        </Link>
    )

    return (
        <aside className={`flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full transition-all duration-300 ease-in-out ${
            isCollapsed ? 'w-[84px] p-2.5' : 'p-4 sm:p-5 w-[260px] lg:w-[280px]'
        } max-w-full ${className}`}>
            <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
                {/* Header profile info */}
                <div className={`flex items-center gap-3 pb-3 border-b border-slate-100 ${isCollapsed ? 'justify-center' : ''}`}>
                    <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-xl size-10 bg-gradient-to-br from-green-500 to-emerald-600 shrink-0 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                        {isAdmin ? 'ADM' : 'POS'}
                    </div>
                    {!isCollapsed && (
                        <div className="flex flex-col min-w-0 flex-1">
                            <h1 className="text-slate-900 text-sm font-bold leading-tight truncate">
                                {isAdmin ? (username || 'Admin') : (storeName || username || 'Staff')}
                            </h1>
                            <p className="text-slate-500 text-xs font-medium leading-tight mt-0.5">
                                {isAdmin ? 'Administrator' : 'Store Staff'}
                            </p>
                        </div>
                    )}
                </div>

                <nav className="flex flex-col">
                    {isAdmin && (
                        <>
                            <NavCategory isCollapsed={isCollapsed} label="Store Operations" icon="storefront" defaultOpen={true}>
                                <NavLink href="/admin/" icon="home" label="Overview" active={isActive('/admin') && (!currentTab || currentTab === 'overview')} />
                                <NavLink href="/inventory/" icon="inventory_2" label="Inventory" active={isActive('/inventory')} />
                                <NavLink href="/menu/" icon="restaurant_menu" label="Menu" active={isActive('/menu')} />
                            </NavCategory>

                            <NavCategory isCollapsed={isCollapsed} label="Financials" icon="monitoring" defaultOpen={true}>
                                <NavLink href="/reports/costing/" icon="request_quote" label="Food Costing" active={isActive('/reports/costing')} />
                                <NavLink href="/admin?tab=reports" icon="bar_chart" label="Reports" active={isActive('/admin') && currentTab === 'reports'} />
                            </NavCategory>

                            <NavCategory isCollapsed={isCollapsed} label="HR & Team" icon="group" defaultOpen={true}>
                                <NavLink href="/admin?tab=users" icon="group" label="Users" active={isActive('/admin') && currentTab === 'users'} />
                                <NavLink href="/admin?tab=hr" icon="badge" label="HR Management" active={isActive('/admin') && currentTab === 'hr'} />
                                <NavLink href="/payroll/" icon="payments" label="Payroll" active={isActive('/payroll')} />
                            </NavCategory>

                            <NavCategory isCollapsed={isCollapsed} label="Settings" icon="settings" defaultOpen={true}>
                                <NavLink href="/admin?tab=stores" icon="store" label="Stores" active={isActive('/admin') && currentTab === 'stores'} />
                            </NavCategory>
                        </>
                    )}

                    {!isAdmin && (
                        <NavCategory isCollapsed={isCollapsed} label="Store Staff" icon="storefront" defaultOpen={true}>
                            <NavLink href="/pos/" icon="storefront" label="POS" active={isActive('/pos')} />
                            <NavLink href="/inventory/" icon="inventory_2" label="Inventory" active={isActive('/inventory')} />
                            <NavLink href="/reports/" icon="analytics" label="Reports" active={isActive('/reports')} />
                        </NavCategory>
                    )}
                </nav>

                <div className="pt-4 mt-auto border-t border-slate-100 flex flex-col gap-1">
                    <NavLink href="/time-clock/" icon="schedule" label="Time Clock" active={isActive('/time-clock')} />
                    
                    <button
                        type="button"
                        onClick={handleLogout}
                        title={isCollapsed ? "Logout" : undefined}
                        className={`transition-colors text-red-600 hover:bg-red-50 rounded-xl w-full ${
                            isCollapsed
                                ? 'flex flex-col items-center justify-center py-2 px-1'
                                : 'flex items-center gap-3 px-3 py-2'
                        }`}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: isCollapsed ? '20px' : '22px' }}>
                            logout
                        </span>
                        {isCollapsed ? (
                            <span className="text-[10px] font-semibold text-center mt-0.5">Logout</span>
                        ) : (
                            <span className="text-sm font-semibold leading-relaxed">Logout</span>
                        )}
                    </button>

                    {!forceExpanded && (
                        <button
                            type="button"
                            onClick={toggleCollapsed}
                            className={`transition-colors text-slate-500 hover:bg-slate-100 hover:text-slate-900 rounded-xl w-full ${
                                isCollapsed
                                    ? 'flex flex-col items-center justify-center py-2 px-1'
                                    : 'flex items-center gap-3 px-3 py-2'
                            }`}
                            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: isCollapsed ? '20px' : '22px' }}>
                                {isCollapsed ? 'chevron_right' : 'chevron_left'}
                            </span>
                            {isCollapsed ? (
                                <span className="text-[10px] font-semibold text-center mt-0.5">Expand</span>
                            ) : (
                                <span className="text-sm font-semibold leading-relaxed">Collapse</span>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </aside>
    )
}
