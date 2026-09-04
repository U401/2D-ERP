'use client'

import { useEffect } from 'react'
import { closeAllSessions } from '@/app/actions/session'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/utils/activity-log'
import { getInstanceId } from '@/lib/utils/instance-id'

export function AppLifecycle() {
    useEffect(() => {
        // Initialize Tauri window listeners
        const init = async () => {
            try {
                // Dynamic import to handle SSR and non-Tauri environments gracefully
                const { getCurrentWindow } = await import('@tauri-apps/api/window')
                const appWindow = getCurrentWindow()
                const supabase = createClient()

                async function markPresenceOffline() {
                    try {
                        const { data: { user } } = await supabase.auth.getUser()
                        if (!user) return

                        await supabase.from('user_presence').upsert({
                            user_id: user.id,
                            status: 'offline',
                            current_page: 'app_closed',
                            last_seen: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        })
                    } catch (error) {
                        console.error('Error marking presence offline:', error)
                    }
                }

                async function signOutLocally() {
                    // Best-effort: record logout, then clear local session so next launch requires login.
                    // Use local signout to avoid network dependency during app shutdown.
                    try {
                        await logActivity('logout', { reason: 'app_closed' })
                    } catch {
                        // ignore
                    }
                    try {
                        // Clear this instance's login lock (if owned)
                        const { data: { user } } = await supabase.auth.getUser()
                        if (user) {
                            const instanceId = getInstanceId()
                            await supabase
                                .from('user_active_logins')
                                .delete()
                                .eq('user_id', user.id)
                                .eq('instance_id', instanceId)
                        }
                        // supabase-js supports { scope: 'local' } to only remove local session
                        // (revoking tokens over the network is unreliable during shutdown).
                        await (supabase.auth as any).signOut({ scope: 'local' })
                    } catch (e) {
                        console.warn('Failed to sign out locally on app close:', e)
                        try {
                            await supabase.auth.signOut()
                        } catch {
                            // ignore
                        }
                    }
                }

                // Listen for the close request
                // onCloseRequested is the specific API that allows preventing the close
                const unlisten = await appWindow.onCloseRequested(async (event: any) => {
                    // Prevent the window from closing immediately
                    event.preventDefault()

                    console.log('App closing: Cleaning up sessions + signing out...')

                    // Create a timeout promise to safely force close if cleanup hangs
                    const timeoutPromise = new Promise(resolve => setTimeout(resolve, 3000))

                    try {
                        const cleanupPromise = (async () => {
                            // Prefer sequential cleanup so we don't sign out before session cleanup runs.
                            await closeAllSessions()
                            await markPresenceOffline()
                            await signOutLocally()
                        })()

                        // Race between cleanup and timeout
                        // We assume cleanup is faster than 3s, but if not we proceed to close
                        await Promise.race([
                            cleanupPromise,
                            timeoutPromise
                        ])
                    } catch (error) {
                        console.error('Error during app cleanup:', error)
                    } finally {
                        // Unlisten to prevent infinite loop if we use close()
                        // but destroy() should skip events.
                        // We'll try destroy first, and if that fails/doesn't exist, we fall back.
                        console.log('Force closing app window')
                        try {
                            await appWindow.destroy()
                        } catch (e) {
                            console.error('Failed to destroy window, trying close:', e)
                            // If close() is called, it triggers onCloseRequested again, 
                            // so we should probably unlisten first if we were to use close().
                            // However, unlisten is a function returned by init, we can calls it.
                            // But inside here we might not have access to 'unlisten' variable easily 
                            // because 'unlisten' const is defined by the return of this await... 
                            // Wait, 'unlisten' is assigned the result of this call. 
                            // We can't use 'unlisten' inside the callback itself reliably if it's not defined yet.
                            // But usually destroy() is the way. 
                            // Let's rely on destroy(). If it fails, the app is stuck anyway.
                            const { exit } = await import('@tauri-apps/plugin-process');
                            await exit(0);
                        }
                    }
                })

                // Return a cleanup function for the effect
                return () => {
                    unlisten()
                }
            } catch (error) {
                // This is expected when running in a browser or during build
                console.log('Tauri window API not available:', error)
            }
        }

        init()
    }, [])

    return null
}
