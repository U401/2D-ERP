import { createClient } from '@/lib/supabase/client'

export type ActivityAction =
  | 'login'
  | 'logout'
  | 'open_session'
  | 'close_session'
  | 'sale'
  | 'inventory'
  | 'menu'
  | string

/**
 * Best-effort activity logger.
 * Never throws (so it won't break POS flows if the table/migrations aren't ready).
 */
export async function logActivity(action_type: ActivityAction, details: Record<string, any> = {}) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('store_id')
      .eq('id', user.id)
      .single()

    const { error } = await supabase.from('activity_logs').insert({
      user_id: user.id,
      action_type,
      details,
      store_id: profile?.store_id || null
    })

    if (error) {
      // Log but don't break UX
      console.warn('logActivity: insert failed', error)
    }
  } catch (e) {
    console.warn('logActivity: unexpected error', e)
  }
}
















