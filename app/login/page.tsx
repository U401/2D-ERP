'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { logActivity } from '@/lib/utils/activity-log'

export default function LoginPage() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()
    const searchParams = useSearchParams()
    const supabase = createClient()
    const reason = searchParams.get('reason')

    async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const formData = new FormData(e.currentTarget)
        const username = formData.get('username') as string
        const password = formData.get('password') as string
        const email = username.includes('@') ? username : `${username}@erp.local`
        console.log('[Login] Attempting sign-in with email:', email)

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (error) {
            console.error('[Login] Supabase error:', error)
            setError(error.message || 'Invalid credentials')
            setLoading(false)
        } else {
            // Ensure profile exists (so activity logs can join to username and FK constraints won't fail)
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                // Fetch profile to determine role and other details
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single()

                try {
                    const { error: upsertError } = await supabase
                        .from('profiles')
                        .upsert({ id: user.id, username }, { onConflict: 'id' })
                    if (upsertError) {
                        console.warn('Failed to upsert profile on login', upsertError)
                    }
                } catch (e) {
                    console.warn('Failed to upsert profile on login', e)
                }

                // Ensure this account has its own Store (tenant) before the app loads any store-scoped data.
                // Admins should not have a store to begin with.
                if (profile?.role !== 'admin') {
                    try {
                        const { error: storeError } = await supabase.rpc('ensure_store_for_user', {
                            p_store_name: `Store - ${username}`,
                        })
                        if (storeError) {
                            console.warn('Failed to ensure store for user on login', storeError)
                        }
                    } catch (e) {
                        console.warn('Failed to ensure store for user on login', e)
                    }
                }

                await logActivity('login', { method: 'password' })

                if (profile?.role === 'admin') {
                    router.push('/admin/')
                } else {
                    router.push('/pos/')
                }
            }
        }
    }

    return (
        <div className="min-h-[100dvh] flex items-center justify-center bg-slate-100">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border border-slate-200">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-900">2D ERP</h1>
                    <p className="text-slate-500 mt-2">Sign in to your account</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    {reason === 'session_taken' && (
                        <div className="text-amber-800 text-sm text-center bg-amber-50 p-3 rounded-lg border border-amber-100">
                            This account was signed in on another device/instance, so you were logged out here.
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                        <input
                            name="username"
                            type="text"
                            required
                            className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-slate-900 focus:outline-none text-slate-900 transition-shadow"
                            placeholder="e.g. ERPTest-1"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                        <input
                            name="password"
                            type="password"
                            required
                            className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-slate-900 focus:outline-none text-slate-900 transition-shadow"
                            placeholder="••••••••"
                        />
                    </div>
                    {error && (
                        <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-lg border border-red-100">
                            {error}
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-slate-900 text-white p-3 rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    >
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </form>
            </div>
        </div>
    )
}
