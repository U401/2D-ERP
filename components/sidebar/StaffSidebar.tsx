'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/utils/activity-log'
import { getInstanceId } from '@/lib/utils/instance-id'

type StaffSidebarProps = {
    className?: string
    onNavigate?: () => void
    forceExpanded?: boolean
    username?: string
    storeName?: string
}

export default function StaffSidebar({
    className = '',
    onNavigate,
    forceExpanded = false,
    username = 'Staff',
    storeName = ''
}: StaffSidebarProps) {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()

    const [collapsedInternal, setCollapsedInternal] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('erp_sidebar_collapsed_staff')
            if (saved !== null) return saved === 'true'
            // Staff defaults to collapsed on POS tablets
            return true
        }
        return true
    })

    const isCollapsed = forceExpanded ? false : collapsedInternal

    const toggleCollapsed = () => {
        const next = !collapsedInternal
        setCollapsedInternal(next)
        if (typeof window !== 'undefined') {
            localStorage.setItem('erp_sidebar_collapsed_staff', String(next))
        }
    }

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

    const NavLink = ({ href, icon, label, active }: { href: string; icon: string; label: string; active: boolean }) => (
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
                        POS
                    </div>
                    {!isCollapsed && (
                        <div className="flex flex-col min-w-0 flex-1">
                            <h1 className="text-slate-900 text-sm font-bold leading-tight truncate">
                                {storeName || username || 'Store Staff'}
                            </h1>
                            <p className="text-emerald-600 text-xs font-semibold leading-tight mt-0.5">
                                Store Staff
                            </p>
                        </div>
                    )}
                </div>

                {/* Staff navigation: dedicated, isolated, direct touch targets */}
                <nav className="flex flex-col gap-1.5">
                    <NavLink href="/pos/" icon="storefront" label="POS" active={isActive('/pos')} />
                    <NavLink href="/inventory/" icon="inventory_2" label="Inventory" active={isActive('/inventory')} />
                    <NavLink href="/reports/" icon="analytics" label="Reports" active={isActive('/reports')} />
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
