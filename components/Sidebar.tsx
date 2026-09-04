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
}

function NavCategory({ label, icon, children, defaultOpen = false }: { label: string, icon: string, children: React.ReactNode, defaultOpen?: boolean }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="flex flex-col mb-3">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-gray-100 transition-colors w-full text-left group"
            >
                <div className="flex items-center gap-3 text-slate-900 group-hover:text-black transition-colors">
                    <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>{icon}</span>
                    <span className="text-base font-black uppercase tracking-wider">{label}</span>
                </div>
                
            </button>
            <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                    <div className="flex flex-col gap-2 pl-3 ml-6 border-l-2 border-slate-100">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function Sidebar({ className = '', onNavigate }: SidebarProps) {
    const pathname = usePathname()
    const router = useRouter()
    const searchParams = useSearchParams()
    const currentTab = searchParams.get('tab')
    const [isAdmin, setIsAdmin] = useState(false)
    const [username, setUsername] = useState<string>('')
    const [storeName, setStoreName] = useState<string>('')
    
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
                setUsername(profile.username)
                if (profile.role === 'admin') {
                    setIsAdmin(true)
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
            onClick={() => onNavigate?.()}
            className={`flex items-center gap-4 px-4 py-4 rounded-xl transition-colors ${
                active ? 'bg-gray-100 hover:bg-gray-200' : 'hover:bg-gray-50'
            }`}
        >
            <span className="material-symbols-outlined text-gray-900" style={{ fontSize: '28px', fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>{icon}</span>
            <p className="text-gray-900 text-xl font-semibold leading-relaxed">{label}</p>
        </Link>
    )

    return (
        <aside className={`flex-shrink-0 bg-white border-r border-gray-200 p-6 flex flex-col h-full w-[360px] max-w-full ${className}`}>
            <div className="flex flex-col gap-5 flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
                <div className="flex items-center gap-4 mb-4">
                    <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-14 bg-gradient-to-br from-green-400 to-green-600"></div>
                    <div className="flex flex-col">
                        <h1 className="text-gray-900 text-lg font-semibold leading-relaxed">
                            {isAdmin ? (username || 'Loading...') : (storeName || 'Loading...')}
                        </h1>
                        <p className="text-gray-500 text-base font-normal leading-relaxed">
                            {isAdmin ? 'Admin' : 'Staff'}
                        </p>
                    </div>
                </div>
                <nav className="flex flex-col mt-2">
                    {isAdmin && (
                        <>
                            <NavCategory label="Store Operations" icon="storefront" defaultOpen={false}>
                                <NavLink href="/admin/" icon="home" label="Overview" active={isActive('/admin') && (!currentTab || currentTab === 'overview')} />
                                <NavLink href="/inventory/" icon="inventory_2" label="Inventory" active={isActive('/inventory')} />
                                <NavLink href="/menu/" icon="restaurant_menu" label="Menu" active={isActive('/menu')} />
                            </NavCategory>

                            <NavCategory label="Financials" icon="monitoring" defaultOpen={false}>
                                <NavLink href="/reports/costing/" icon="request_quote" label="Food Costing" active={isActive('/reports/costing')} />
                                <NavLink href="/admin?tab=reports" icon="bar_chart" label="Reports" active={isActive('/admin') && currentTab === 'reports'} />
                            </NavCategory>

                            <NavCategory label="HR & Team" icon="group" defaultOpen={false}>
                                <NavLink href="/admin?tab=users" icon="group" label="Users" active={isActive('/admin') && currentTab === 'users'} />
                                <NavLink href="/admin?tab=hr" icon="badge" label="HR Management" active={isActive('/admin') && currentTab === 'hr'} />
                                <NavLink href="/payroll/" icon="payments" label="Payroll" active={isActive('/payroll')} />
                            </NavCategory>

                            <NavCategory label="Settings" icon="settings" defaultOpen={false}>
                                <NavLink href="/admin?tab=stores" icon="store" label="Stores" active={isActive('/admin') && currentTab === 'stores'} />
                            </NavCategory>
                        </>
                    )}

                    {!isAdmin && (
                        <NavCategory label="Store Staff" icon="storefront" defaultOpen={true}>
                            <NavLink href="/pos/" icon="storefront" label="POS" active={isActive('/pos')} />
                            <NavLink href="/inventory/" icon="inventory_2" label="Inventory" active={isActive('/inventory')} />
                            <NavLink href="/reports/" icon="analytics" label="Reports" active={isActive('/reports')} />
                        </NavCategory>
                    )}
                </nav>

                <div className="pt-6 mt-auto border-t border-gray-100 flex flex-col gap-2">
                    <NavLink href="/time-clock/" icon="schedule" label="Time Clock" active={isActive('/time-clock')} />
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-4 px-4 py-4 rounded-xl transition-colors hover:bg-red-50 text-red-600 w-full"
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>
                            logout
                        </span>
                        <p className="text-xl font-semibold leading-relaxed">
                            Logout
                        </p>
                    </button>
                </div>
            </div>
        </aside>
    )
}