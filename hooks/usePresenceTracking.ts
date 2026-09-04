'use client'

import { useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePathname } from 'next/navigation'

export function usePresenceTracking() {
    const pathname = usePathname()
    const pathnameRef = useRef<string>(pathname || '/')
    const supabase = useMemo(() => createClient(), [])
    const lastUpdateRef = useRef<number>(0)
    const lastStatusRef = useRef<'online' | 'offline' | 'idle' | null>(null)
    const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

    // Keep the latest pathname without forcing the main presence effect to re-run
    useEffect(() => {
        pathnameRef.current = pathname || '/'
    }, [pathname])

    useEffect(() => {
        let isActive = true

        async function updatePresence(status: 'online' | 'offline' | 'idle') {
            if (!isActive) return

            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                console.log('usePresenceTracking: No user found')
                return
            }

            const now = Date.now()
            // Only throttle repeated 'online' heartbeats; never throttle status changes.
            if (
                status === 'online' &&
                lastStatusRef.current === 'online' &&
                now - lastUpdateRef.current < 5000
            ) {
                return
            }

            lastUpdateRef.current = now
            lastStatusRef.current = status

            console.log('usePresenceTracking: Updating presence:', {
                user_id: user.id,
                status,
                current_page: pathnameRef.current
            })

            const { error } = await supabase.from('user_presence').upsert({
                user_id: user.id,
                status,
                current_page: pathnameRef.current,
                last_seen: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })

            if (error) {
                console.error('usePresenceTracking: Error updating presence:', error)
            } else {
                console.log('usePresenceTracking: Presence updated successfully')
            }
        }

        // Set online on mount
        updatePresence('online')

        // Update presence every 30 seconds
        presenceIntervalRef.current = setInterval(() => {
            updatePresence('online')
        }, 30000)

        // Handle visibility change
        const handleVisibilityChange = () => {
            if (document.hidden) {
                updatePresence('idle')
            } else {
                updatePresence('online')
            }
        }

        // Handle beforeunload (app closing)
        const handleBeforeUnload = () => {
            updatePresence('offline')
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        window.addEventListener('beforeunload', handleBeforeUnload)

        return () => {
            // IMPORTANT: don't mark offline on React re-renders/route changes.
            // Offline is handled via beforeunload + Tauri close handler.
            isActive = false
            if (presenceIntervalRef.current) {
                clearInterval(presenceIntervalRef.current)
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            window.removeEventListener('beforeunload', handleBeforeUnload)
        }
    }, [supabase])

    // Update presence when pathname changes
    useEffect(() => {
        const updatePage = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            await supabase.from('user_presence').upsert({
                user_id: user.id,
                status: 'online',
                current_page: pathname,
                last_seen: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
        }

        updatePage()
    }, [pathname, supabase])
}
