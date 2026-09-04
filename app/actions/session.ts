import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/utils/activity-log'

export async function openSession() {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', sessionId: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('store_id')
    .eq('id', user.id)
    .single()

  if (!profile?.store_id) {
    return { success: false, error: 'User has no store assigned', sessionId: null }
  }

  const { data, error } = await supabase.rpc('open_session')

  if (error) {
    return { success: false, error: error.message, sessionId: null }
  }

  await logActivity('open_session', { session_id: data })
  return { success: true, error: null, sessionId: data }
}

export async function closeSession(sessionId: string) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('store_id')
    .eq('id', user.id)
    .single()

  if (!profile?.store_id) {
    return { success: false, error: 'User has no store assigned' }
  }

  // Verify session belongs to store
  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('store_id', profile.store_id)
    .single()

  if (!session) {
    return { success: false, error: 'Session not found in this store' }
  }

  const { error } = await supabase.rpc('close_session', {
    p_session_id: sessionId,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  await logActivity('close_session', { session_id: sessionId })
  return { success: true, error: null }
}

export async function getCurrentSession() {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: true, error: null, session: null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('store_id')
    .eq('id', user.id)
    .single()

  if (!profile?.store_id) {
    return { success: false, error: 'User has no store assigned', session: null }
  }

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('status', 'open')
    .eq('user_id', user.id)
    .eq('store_id', profile.store_id)
    .order('opened_at', { ascending: false })
    .limit(1)

  if (error) {
    return { success: false, error: error.message, session: null }
  }

  // limit(1) returns an array
  const session = Array.isArray(data) ? (data[0] ?? null) : (data as any)
  return { success: true, error: null, session }
}

export async function closeAllSessions() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: true, error: null, closedCount: 0 }
  }
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('store_id')
    .eq('id', user.id)
    .single()

  if (!profile?.store_id) {
    return { success: false, error: 'User has no store assigned', closedCount: 0 }
  }

  // Close only the current user's open session(s) in their store.
  const { data, error } = await supabase
    .from('sessions')
    .update({ 
      status: 'closed', 
      closed_at: new Date().toISOString() 
    })
    .eq('status', 'open')
    .eq('user_id', user.id)
    .eq('store_id', profile.store_id)
    .select()

  if (error) {
    return { success: false, error: error.message, closedCount: 0 }
  }

  return { success: true, error: null, closedCount: data?.length || 0 }
}

