'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/utils/activity-log'
import { getInstanceId } from '@/lib/utils/instance-id'
import { showConfirm } from '@/components/GlobalConfirm'

type AdminDrawerProps = {
    isOpen: boolean
    onClose: () => void
    username?: string
}

export default function AdminDrawer({
    isOpen,
    onClose,
    username = 'Admin'
}: AdminDrawerProps) {
    const pathname = usePathname()
    const router = useRouter()
    const searchParams = useSearchParams()
    const currentTab = searchParams.get('tab')
    const supabase = createClient()

    if (!isOpen) return null

    const normalizePath = (p: string) => (p.endsWith('/') ? p : `${p}/`)
    const isActive = (path: string) => {
        const a = normalizePath(pathname || '/')
        const b = normalizePath(path)
        return a === b
    }

    async function handleLogout() {
        if (!(await showConfirm('Are you sure you want to log out?'))) return
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
        onClose()
    }

    const NavLink = ({ href, icon, label, active }: { href: string; icon: string; label: string; active: boolean }) => (
        <Link
            href={href}
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl w-full transition-all ${
                active 
                    ? 'bg-slate-900 text-white font-bold shadow-sm' 
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium'
            }`}
        >
            <span 
                className="material-symbols-outlined shrink-0 text-[22px]"
                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
            >
                {icon}
            </span>
            <span className="text-sm font-semibold leading-relaxed truncate">{label}</span>
        </Link>
    )

    const SectionHeader = ({ label }: { label: string }) => (
        <div className="pt-3 pb-1 px-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {label}
            </span>
        </div>
    )

    return (
        <div className="fixed inset-0 z-50 flex md:hidden">
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm transition-opacity" 
                onClick={onClose}
            />
            
            {/* Slide-over panel - self contained, fills width without inner dividing lines */}
            <div className="relative flex w-[280px] sm:w-[300px] max-w-[85vw] flex-col bg-white h-full shadow-2xl z-10 border-r border-slate-200">
                {/* Header with safe-area top padding for Android status bar / notch */}
                <div className="pt-[max(1.25rem,env(safe-area-inset-top))] px-4 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-xl size-10 bg-gradient-to-br from-purple-600 to-indigo-700 shrink-0 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                            ADM
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                            <h2 className="text-slate-900 text-sm font-bold leading-tight truncate">
                                {username || 'Admin'}
                            </h2>
                            <p className="text-purple-600 text-xs font-semibold leading-tight mt-0.5">
                                Administrator
                            </p>
                        </div>
                    </div>
                    {/* Clean in-header Close Button */}
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors shrink-0 ml-2"
                        title="Close Menu"
                    >
                        <span className="material-symbols-outlined text-[22px]">close</span>
                    </button>
                </div>

                {/* Nav Links Container */}
                <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-0.5 custom-scrollbar">
                    <SectionHeader label="Store Operations" />
                    <NavLink href="/admin/" icon="home" label="Overview" active={isActive('/admin') && (!currentTab || currentTab === 'overview')} />
                    <NavLink href="/inventory/" icon="inventory_2" label="Inventory" active={isActive('/inventory')} />
                    <NavLink href="/menu/" icon="restaurant_menu" label="Menu" active={isActive('/menu')} />

                    <SectionHeader label="Financials" />
                    <NavLink href="/reports/costing/" icon="request_quote" label="Food Costing" active={isActive('/reports/costing')} />
                    <NavLink href="/admin?tab=reports" icon="bar_chart" label="Reports" active={isActive('/admin') && currentTab === 'reports'} />

                    <SectionHeader label="HR & Team" />
                    <NavLink href="/admin?tab=users" icon="group" label="Users" active={isActive('/admin') && currentTab === 'users'} />
                    <NavLink href="/admin?tab=hr" icon="badge" label="HR Management" active={isActive('/admin') && currentTab === 'hr'} />
                    <NavLink href="/payroll/" icon="payments" label="Payroll" active={isActive('/payroll')} />

                    <SectionHeader label="Settings" />
                    <NavLink href="/admin?tab=stores" icon="store" label="Stores" active={isActive('/admin') && currentTab === 'stores'} />
                </div>

                {/* Footer Actions */}
                <div className="p-3 border-t border-slate-100 flex flex-col gap-1 shrink-0 bg-slate-50/30">
                    <NavLink href="/time-clock/" icon="schedule" label="Time Clock" active={isActive('/time-clock')} />
                    
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-600 hover:bg-red-50 transition-colors w-full font-medium"
                    >
                        <span className="material-symbols-outlined text-[22px]">logout</span>
                        <span className="text-sm font-semibold">Logout</span>
                    </button>
                </div>
            </div>
        </div>
    )
}
