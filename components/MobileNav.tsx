'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function MobileNav() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const currentTab = searchParams.get('tab')
    const [isAdmin, setIsAdmin] = useState(false)
    const supabase = createClient()

    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single()

                if (profile && profile.role === 'admin') {
                    setIsAdmin(true)
                }
            }
        }
        checkUser()
    }, [])

    const isActive = (path: string) => {
        if (path.includes('?tab=')) {
            const [base, query] = path.split('?tab=')
            return pathname === base && currentTab === query
        }
        if (pathname === '/admin/' || pathname === '/admin') {
            return path === '/admin/' && (!currentTab || currentTab === 'overview')
        }
        if (pathname === '/inventory/' || pathname === '/inventory') {
            return path === '/inventory/'
        }
        if (pathname === '/menu/' || pathname === '/menu') {
            return path === '/menu/'
        }
        if (pathname === '/reports/costing/' || pathname === '/reports/costing') {
            return path === '/reports/costing/'
        }
        return pathname?.startsWith(path) && path !== '/'
    }

    const adminLinks = [
        { href: '/admin/', icon: 'home', label: 'Admin' },
        { href: '/inventory/', icon: 'inventory_2', label: 'Inventory' },
        { href: '/menu/', icon: 'restaurant_menu', label: 'Menu' },
        { href: '/reports/costing/', icon: 'request_quote', label: 'Costing' },
        { href: '/payroll/', icon: 'payments', label: 'Payroll' },
        { href: '/admin?tab=reports', icon: 'bar_chart', label: 'Reports' },
        { href: '/admin?tab=stores', icon: 'store', label: 'Stores' },
        { href: '/admin?tab=users', icon: 'group', label: 'Users' },
        { href: '/admin?tab=hr', icon: 'badge', label: 'HR' }
    ]

    const staffLinks = [
        { href: '/pos/', icon: 'storefront', label: 'POS' },
        { href: '/inventory/', icon: 'inventory_2', label: 'Inventory' },
        { href: '/reports/', icon: 'analytics', label: 'Reports' }
    ]

    const links = isAdmin ? adminLinks : staffLinks

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 flex items-stretch shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-x-auto">
            {links.map((link) => {
                const active = isActive(link.href)
                return (
                    <Link
                        key={link.href}
                        href={link.href}
                        className={`flex-1 min-w-[65px] flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition-colors relative ${
                            active ? 'text-gray-900' : 'text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        <span
                            className={`material-symbols-outlined transition-all ${active ? 'text-[22px]' : 'text-[20px]'}`}
                            style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                        >
                            {link.icon}
                        </span>
                        <span className={`truncate px-0.5 ${active ? 'text-gray-900' : 'text-slate-400'}`}>
                            {link.label}
                        </span>
                        {active && (
                            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-gray-900" />
                        )}
                    </Link>
                )
            })}
        </nav>
    )
}
