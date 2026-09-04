'use client'

import { usePresenceTracking } from '@/hooks/usePresenceTracking'
import { useScreenSharing } from '@/hooks/useScreenSharing'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePathname } from 'next/navigation'

function MonitoringHooks() {
    // Called only when a user is logged in
    usePresenceTracking()
    useScreenSharing(true, {
        intervalMs: 2000,
        quality: 0.9,
        maxScale: 1.5,
        cleanupEvery: 8,
        captureMode: 'full',
    })
    return null
}

export function UserMonitoring({ children }: { children: React.ReactNode }) {
    const [hasUser, setHasUser] = useState(false)
    const supabase = createClient()
    const pathname = usePathname()
    const isLoginPage = pathname?.startsWith('/login')

    useEffect(() => {
        // Don't bother checking on the login page — no one is logged in yet
        if (isLoginPage) {
            setHasUser(false)
            return
        }

        async function checkUser() {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                setHasUser(!!user)
            } catch {
                setHasUser(false)
            }
        }

        checkUser()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setHasUser(!!session?.user)
        })

        return () => subscription.unsubscribe()
    }, [supabase, isLoginPage])

    return (
        <>
            {hasUser && <MonitoringHooks />}
            {children}
        </>
    )
}
