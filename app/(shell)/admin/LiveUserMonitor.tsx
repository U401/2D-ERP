'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'

type UserPresence = {
    user_id: string
    status: 'online' | 'offline' | 'idle'
    last_seen: string
    current_page: string
    profiles: { username: string; role: string }
}

type ScreenShare = {
    id: string
    user_id: string
    screenshot_data: string
    created_at: string
}

export function LiveUserMonitor() {
    const [users, setUsers] = useState<UserPresence[]>([])
    const [selectedUser, setSelectedUser] = useState<string | null>(null)
    const [latestScreen, setLatestScreen] = useState<ScreenShare | null>(null)
    const [screenError, setScreenError] = useState<string | null>(null)
    const [refreshingScreen, setRefreshingScreen] = useState(false)
    const [presenceError, setPresenceError] = useState<string | null>(null)
    const supabase = createClient()
    const fetchLatestScreenRef = useRef<(() => Promise<void>) | null>(null)

    useEffect(() => {
        async function fetchUsers() {
            console.log('Fetching user presence...')

            // Fetch presence first. We *don't* rely on PostgREST embedded relationships here
            // because some databases link user_id to auth.users (not public.profiles),
            // which makes `profiles(...)` joins fail with a schema cache relationship error.
            const { data: presenceData, error: presenceFetchError } = await supabase
                .from('user_presence')
                .select('*')
                .order('updated_at', { ascending: false })

            console.log('User presence data:', presenceData)
            console.log('User presence error:', presenceFetchError)

            if (presenceFetchError) {
                setPresenceError(presenceFetchError.message)
                console.error('Error fetching presence:', presenceFetchError)
                return
            }
            setPresenceError(null)

            if (!presenceData || presenceData.length === 0) {
                setUsers([])
                return
            }

            // Fetch profiles for those users (manual join)
            const userIds = presenceData.map((p: any) => p.user_id).filter(Boolean)
            const { data: profilesData, error: profilesError } = await supabase
                .from('profiles')
                .select('id, username, role')
                .in('id', userIds)

            if (profilesError) {
                console.warn('Error fetching profiles for presence list:', profilesError)
            }

            // Manually join the data + compute an "effective" status based on recency.
            // This prevents stale rows (e.g., app crashed/closed) from showing as online forever.
            const nowMs = Date.now()
            const STALE_AFTER_MS = 3 * 60 * 1000 // heartbeat is 30s; allow timer drift/background throttling

            const usersWithProfiles = presenceData.map((presence: any) => {
                const profile = profilesData?.find((p: any) => p.id === presence.user_id)

                const lastSeenMs = presence.last_seen ? new Date(presence.last_seen).getTime() : 0
                const ageMs = lastSeenMs ? nowMs - lastSeenMs : Number.POSITIVE_INFINITY
                const isStale = ageMs > STALE_AFTER_MS

                const effectiveStatus: 'online' | 'offline' | 'idle' =
                    presence.status === 'offline'
                        ? 'offline'
                        : isStale
                            ? 'offline'
                            : (presence.status === 'idle' ? 'idle' : 'online')

                return {
                    ...presence,
                    status: effectiveStatus,
                    profiles: profile || { username: 'Unknown', role: 'user' }
                }
            })

            console.log('Users with profiles:', usersWithProfiles)
            setUsers(usersWithProfiles as any)
        }

        fetchUsers()

        // Subscribe to presence changes
        const channel = supabase
            .channel('user_presence_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'user_presence',
                },
                (payload) => {
                    console.log('User presence change:', payload)
                    fetchUsers()
                }
            )
            .subscribe((status) => {
                console.log('User presence subscription status:', status)
            })

        return () => {
            supabase.removeChannel(channel)
        }
    }, [supabase])

    useEffect(() => {
        if (!selectedUser) {
            setLatestScreen(null)
            setScreenError(null)
            return
        }

        async function fetchLatestScreen() {
            setRefreshingScreen(true)
            const { data, error } = await supabase
                .from('screen_shares')
                .select('*')
                .eq('user_id', selectedUser)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            if (error) {
                setScreenError(error.message)
                setLatestScreen(null)
            } else if (data) {
                setScreenError(null)
                setLatestScreen(data)
            }
            setRefreshingScreen(false)
        }
        fetchLatestScreenRef.current = fetchLatestScreen

        fetchLatestScreen()

        // Subscribe to screen share updates for selected user
        const channel = supabase
            .channel(`screen_shares_${selectedUser}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'screen_shares',
                    filter: `user_id=eq.${selectedUser}`
                },
                (payload) => {
                    const next = payload.new as ScreenShare
                    if (next) {
                        setLatestScreen((prev) => {
                            if (!prev) return next
                            const prevTs = new Date(prev.created_at).getTime()
                            const nextTs = new Date(next.created_at).getTime()
                            return nextTs > prevTs ? next : prev
                        })
                    }
                    setScreenError(null)
                    setRefreshingScreen(false)
                }
            )
            .subscribe()

        // Refresh screen every 2 seconds as fallback
        const interval = setInterval(fetchLatestScreen, 2000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(interval)
            fetchLatestScreenRef.current = null
        }
    }, [selectedUser, supabase])

    const onlineUsers = users.filter(u => u.status === 'online')
    const idleUsers = users.filter(u => u.status === 'idle')
    const offlineUsers = users.filter(u => u.status === 'offline')

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
            {/* User List */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 lg:col-span-4 flex flex-col min-h-0">
                <h2 className="text-lg font-bold mb-3 text-slate-900">Live Users</h2>

                {presenceError && (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <p className="font-semibold">Presence is not available yet.</p>
                        <p className="mt-1 text-xs text-amber-800">
                            Error: {presenceError}. This usually means the `user_presence` table/RLS policies haven’t been applied in Supabase yet.
                            Open <span className="font-mono">/test-monitoring/</span> to confirm, then run the monitoring migration in Supabase SQL Editor.
                        </p>
                    </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                    <div className="space-y-4">
                    {/* Online Users */}
                    {onlineUsers.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-green-600 mb-2">Online ({onlineUsers.length})</h3>
                            {onlineUsers.map((user) => (
                                <button
                                    key={user.user_id}
                                    onClick={() => setSelectedUser(user.user_id)}
                                    className={`w-full flex flex-col items-stretch justify-start text-left p-3 rounded-lg border transition-all ${selectedUser === user.user_id
                                        ? 'bg-blue-50 border-blue-300'
                                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-green-500" />
                                            <span className="font-medium text-slate-900">
                                                {user.profiles?.username || 'Unknown'}
                                            </span>
                                        </div>
                                        {user.profiles?.role === 'admin' && (
                                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Admin</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1 ml-4">
                                        {user.current_page || 'Unknown page'}
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-1 ml-4">
                                        Last seen {formatDistanceToNow(new Date(user.last_seen), { addSuffix: true })}
                                    </p>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Idle Users */}
                    {idleUsers.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-yellow-600 mb-2">Idle ({idleUsers.length})</h3>
                            {idleUsers.map((user) => (
                                <button
                                    key={user.user_id}
                                    onClick={() => setSelectedUser(user.user_id)}
                                    className={`w-full flex flex-col items-stretch justify-start text-left p-3 rounded-lg border transition-all ${selectedUser === user.user_id
                                        ? 'bg-blue-50 border-blue-300'
                                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-yellow-500" />
                                        <span className="font-medium text-slate-900">
                                            {user.profiles?.username || 'Unknown'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1 ml-4">
                                        Last seen {formatDistanceToNow(new Date(user.last_seen), { addSuffix: true })}
                                    </p>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Offline Users */}
                    {offlineUsers.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-slate-400 mb-2">Offline ({offlineUsers.length})</h3>
                            {offlineUsers.map((user) => (
                                <div
                                    key={user.user_id}
                                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 opacity-60"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-slate-400" />
                                        <span className="font-medium text-slate-700">
                                            {user.profiles?.username || 'Unknown'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1 ml-4">
                                        Last seen {formatDistanceToNow(new Date(user.last_seen), { addSuffix: true })}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

                    {users.length === 0 && (
                        <p className="text-slate-500 text-center py-8">No users found</p>
                    )}
                    </div>
                </div>
            </div>

            {/* Screen View */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 lg:col-span-8 flex flex-col min-h-0">
                <h2 className="text-lg font-bold mb-3 text-slate-900">Live Screen View</h2>

                {selectedUser ? (
                    <div className="flex flex-col gap-4 min-h-0">
                        {latestScreen ? (
                            <div className="flex flex-col gap-3 min-h-0">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-sm text-slate-600">
                                        Last updated: {formatDistanceToNow(new Date(latestScreen.created_at), { addSuffix: true })}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        {(() => {
                                            const ageMs = Date.now() - new Date(latestScreen.created_at).getTime()
                                            const stale = ageMs > 6_000
                                            return (
                                                <>
                                                    <div className={`w-2 h-2 rounded-full ${stale ? 'bg-amber-500' : 'bg-green-500'} ${stale ? '' : 'animate-pulse'}`} />
                                                    <span className="text-xs text-slate-600">
                                                        {stale ? 'Stale' : 'Live'}
                                                    </span>
                                                </>
                                            )
                                        })()}
                                        <button
                                            type="button"
                                            onClick={() => fetchLatestScreenRef.current?.()}
                                            className="ml-2 text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-700"
                                            disabled={refreshingScreen}
                                            title="Refresh screenshot"
                                        >
                                            {refreshingScreen ? 'Refreshing…' : 'Refresh'}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 min-h-[260px] min-w-0 border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                                    <img
                                        src={latestScreen.screenshot_data}
                                        alt="User screen"
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 min-h-[260px] flex items-center justify-center bg-slate-50 rounded-lg border border-slate-200">
                                <div className="text-center">
                                    {screenError ? (
                                        <>
                                            <p className="text-slate-900 font-medium">Unable to load screenshot</p>
                                            <p className="text-slate-600 text-sm mt-1">{screenError}</p>
                                            <button
                                                type="button"
                                                onClick={() => fetchLatestScreenRef.current?.()}
                                                className="mt-4 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800"
                                            >
                                                Retry
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto mb-4"></div>
                                            <p className="text-slate-600">Waiting for screen capture...</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 min-h-[260px] flex items-center justify-center bg-slate-50 rounded-lg border border-slate-200">
                        <p className="text-slate-500">Select a user to view their screen</p>
                    </div>
                )}
            </div>
        </div>
    )
}
