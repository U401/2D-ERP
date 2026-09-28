'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminSidebar from './sidebar/AdminSidebar'
import StaffSidebar from './sidebar/StaffSidebar'

type SidebarProps = {
    className?: string
    onNavigate?: () => void
    forceExpanded?: boolean
}

export default function Sidebar({ className = '', onNavigate, forceExpanded = false }: SidebarProps) {
    const [isAdmin, setIsAdmin] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            // Fast optimistic check from pathname: if on /admin, default to admin
            return window.location.pathname.startsWith('/admin')
        }
        return false
    })
    const [username, setUsername] = useState<string>('')
    const [storeName, setStoreName] = useState<string>('')
    const [loaded, setLoaded] = useState(false)

    const supabase = createClient()

    useEffect(() => {
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
                    setIsAdmin(userIsAdmin)
                    setUsername(profile.username || '')

                    if (!userIsAdmin && profile.store_id) {
                        const { data: store } = await supabase
                            .from('stores')
                            .select('name')
                            .eq('id', profile.store_id)
                            .single()
                        setStoreName(store?.name || '')
                    }
                }
            }
            setLoaded(true)
        }
        checkUser()
    }, [supabase])

    if (isAdmin) {
        return (
            <AdminSidebar
                className={className}
                onNavigate={onNavigate}
                forceExpanded={forceExpanded}
                username={username}
            />
        )
    }

    return (
        <StaffSidebar
            className={className}
            onNavigate={onNavigate}
            forceExpanded={forceExpanded}
            username={username}
            storeName={storeName}
        />
    )
}
