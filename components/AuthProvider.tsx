'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import { getInstanceId } from '@/lib/utils/instance-id'

const AuthContext = createContext<{ user: any; loading: boolean }>({
    user: null,
    loading: true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const router = useRouter()
    const pathname = usePathname()
    const supabase = createClient()

    // Enforce single active login per account:
    // - If same account logs in elsewhere, this instance signs out.
    // - Different accounts remain independent (separate storage keys).
    useEffect(() => {
        if (!user?.id) return

        const instanceId = getInstanceId()
        let stopped = false
        let poll: ReturnType<typeof setInterval> | undefined

        async function signOutBecauseTaken() {
            if (stopped) return
            stopped = true
            try {
                await (supabase.auth as any).signOut({ scope: 'local' })
            } catch {
                try { await supabase.auth.signOut() } catch { /* ignore */ }
            }
            router.push('/login/?reason=session_taken')
        }

        async function claimOnStart() {
            if (stopped) return

            // Claim on start (this makes "latest login wins").
            // Important: we MUST NOT sign out just because another instance previously owned the lock.
            // If this device has a valid session, it should take over and kick the other instance out.
            const nowIso = new Date().toISOString()
            const { error: upsertError } = await supabase
                .from('user_active_logins')
                .upsert({
                    user_id: user.id,
                    instance_id: instanceId,
                    last_claimed_at: nowIso,
                    updated_at: nowIso,
                })

            if (upsertError) {
                console.warn('user_active_logins: unable to claim lock', upsertError)
            }
        }

        async function heartbeatValidate() {
            if (stopped) return

            // Only refresh if we still own the lock. This prevents ping-pong.
            const nowIso = new Date().toISOString()
            const { data, error } = await supabase
                .from('user_active_logins')
                .update({ updated_at: nowIso })
                .eq('user_id', user.id)
                .eq('instance_id', instanceId)
                .select('user_id')

            if (error) {
                console.warn('user_active_logins: heartbeat failed', error)
                return
            }

            const updated = Array.isArray(data) ? data.length : 0
            if (updated === 0) {
                // Someone else took over.
                await signOutBecauseTaken()
            }
        }

        // Claim immediately on mount (latest login wins)
        claimOnStart()

        // Subscribe for immediate kick-out
        const channel = supabase
            .channel(`user_active_logins_${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'user_active_logins',
                    filter: `user_id=eq.${user.id}`,
                },
                async (payload) => {
                    const next = payload.new as any
                    if (!next) return
                    if (next.instance_id && next.instance_id !== instanceId) {
                        await signOutBecauseTaken()
                    }
                }
            )
            .subscribe()

        // Poll as fallback (Tauri can sometimes miss realtime events)
        poll = setInterval(heartbeatValidate, 5000)

        return () => {
            stopped = true
            if (poll) clearInterval(poll)
            supabase.removeChannel(channel)
        }
    }, [router, supabase, user?.id])

    useEffect(() => {
        const getRedirectPath = async (user: any) => {
            if (!user) return '/login/'
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single()
            return profile?.role === 'admin' ? '/admin/' : '/pos/'
        }

        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            setUser(session?.user ?? null)
            setLoading(false)

            const isLoginPage = pathname.startsWith('/login')
            const isPublic = pathname.startsWith('/_next') || pathname.includes('.') || pathname === '/favicon.ico'

            if (!session && !isLoginPage && !isPublic) {
                router.push('/login/')
            } else if (session && isLoginPage) {
                const path = await getRedirectPath(session.user)
                router.push(path)
            }
        }

        checkUser()

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setUser(session?.user ?? null)
            setLoading(false)

            const isLoginPage = pathname.startsWith('/login')

            if (!session && !isLoginPage) {
                router.push('/login/')
            } else if (session && isLoginPage) {
                const path = await getRedirectPath(session.user)
                router.push(path)
            }
        })

        return () => subscription.unsubscribe()
    }, [pathname, router, supabase])

    if (loading) {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center bg-slate-100">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
            </div>
        )
    }

    const isLoginPage = pathname.startsWith('/login')
    const isPublic = pathname.startsWith('/_next') || pathname.includes('.') || pathname === '/favicon.ico'

    // Prevent rendering protected content if not authenticated
    if (!user && !isLoginPage && !isPublic) {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center bg-slate-100">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto mb-4"></div>
                    <p className="text-slate-600 text-sm">Redirecting to login...</p>
                </div>
            </div>
        )
    }

    // Prevent rendering login page if already authenticated
    if (user && isLoginPage) {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center bg-slate-100">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto mb-4"></div>
                    <p className="text-slate-600 text-sm">Loading...</p>
                </div>
            </div>
        )
    }

    return (
        <AuthContext.Provider value={{ user, loading }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
