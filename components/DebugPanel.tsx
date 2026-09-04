'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type DebugLog = {
    timestamp: string
    type: 'info' | 'error' | 'success'
    message: string
    data?: any
}

export function DebugPanel() {
    const [logs, setLogs] = useState<DebugLog[]>([])
    const [isVisible, setIsVisible] = useState(true)
    const supabase = createClient()

    // Don't show the debug panel when running inside the Tauri app
    const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__

    const addLog = (type: DebugLog['type'], message: string, data?: any) => {
        const log: DebugLog = {
            timestamp: new Date().toLocaleTimeString(),
            type,
            message,
            data
        }
        setLogs(prev => [log, ...prev].slice(0, 50))
    }

    useEffect(() => {
        if (isTauri) return

        async function runDiagnostics() {
            addLog('info', 'Starting diagnostics...')

            // Check user
            const { data: { user }, error: userError } = await supabase.auth.getUser()
            if (userError) {
                addLog('error', 'Failed to get user', userError)
                return
            }
            if (!user) {
                addLog('error', 'No user logged in')
                return
            }
            addLog('success', 'User authenticated', { id: user.id, email: user.email })

            // Check profile
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single()

            if (profileError) {
                addLog('error', 'Failed to get profile', profileError)
            } else {
                addLog('success', 'Profile loaded', profile)
            }

            // Check if user_presence table exists
            const { data: presenceData, error: presenceError } = await supabase
                .from('user_presence')
                .select('*')
                .limit(1)

            if (presenceError) {
                addLog('error', 'user_presence table error', presenceError)
            } else {
                addLog('success', 'user_presence table accessible', { count: presenceData?.length || 0 })
            }

            // Try to insert presence
            const { data: insertData, error: insertError } = await supabase
                .from('user_presence')
                .upsert({
                    user_id: user.id,
                    status: 'online',
                    current_page: '/admin',
                    last_seen: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select()

            if (insertError) {
                addLog('error', 'Failed to insert presence', insertError)
            } else {
                addLog('success', 'Presence inserted', insertData)
            }

            // Check all presence records
            const { data: allPresence, error: allPresenceError } = await supabase
                .from('user_presence')
                .select('*')
                .order('updated_at', { ascending: false })

            if (allPresenceError) {
                addLog('error', 'Failed to fetch all presence', allPresenceError)
            } else {
                // Get profiles for the users
                if (allPresence && allPresence.length > 0) {
                    const userIds = allPresence.map((p: any) => p.user_id)
                    const { data: profilesData } = await supabase
                        .from('profiles')
                        .select('id, username, role')
                        .in('id', userIds)

                    const presenceWithProfiles = allPresence.map((presence: any) => {
                        const profile = profilesData?.find((p: any) => p.id === presence.user_id)
                        return {
                            ...presence,
                            profile: profile || { username: 'Unknown', role: 'user' }
                        }
                    })

                    addLog('success', `Found ${allPresence.length} presence records`, presenceWithProfiles)
                } else {
                    addLog('success', 'No presence records found', [])
                }
            }

            // Check screen_shares table
            const { data: screenData, error: screenError } = await supabase
                .from('screen_shares')
                .select('*')
                .limit(1)

            if (screenError) {
                addLog('error', 'screen_shares table error', screenError)
            } else {
                addLog('success', 'screen_shares table accessible')
            }
        }

        runDiagnostics()
    }, [supabase])

    if (isTauri) return null

    if (!isVisible) {
        return (
            <button
                onClick={() => setIsVisible(true)}
                className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700"
            >
                Show Debug Panel
            </button>
        )
    }

    return (
        <div
            data-screenshot-ignore="true"
            className="fixed bottom-4 right-4 w-96 max-h-96 bg-white border-2 border-blue-500 rounded-lg shadow-2xl overflow-hidden z-50"
        >
            <div className="bg-blue-600 text-white p-3 flex items-center justify-between">
                <h3 className="font-bold">Debug Panel</h3>
                <button
                    onClick={() => setIsVisible(false)}
                    className="text-white hover:text-gray-200"
                >
                    ✕
                </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-80 space-y-2">
                {logs.length === 0 && (
                    <p className="text-gray-500 text-sm">No logs yet...</p>
                )}
                {logs.map((log, index) => (
                    <div
                        key={index}
                        className={`p-2 rounded text-xs border ${log.type === 'error'
                            ? 'bg-red-50 border-red-300 text-red-800'
                            : log.type === 'success'
                                ? 'bg-green-50 border-green-300 text-green-800'
                                : 'bg-blue-50 border-blue-300 text-blue-800'
                            }`}
                    >
                        <div className="font-semibold">{log.timestamp} - {log.message}</div>
                        {log.data && (
                            <pre className="mt-1 text-xs overflow-auto">
                                {JSON.stringify(log.data, null, 2)}
                            </pre>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
