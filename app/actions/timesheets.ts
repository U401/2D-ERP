import { createClient } from '@/lib/supabase/client'

export async function importTimesheets(
  storeId: string,
  events: Array<{
    user_id: string
    event_type: 'clock_in' | 'clock_out'
    occurred_at: string
    source: string
  }>
) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Prepare payload
  const payload = events.map(event => ({
    store_id: storeId,
    user_id: event.user_id,
    event_type: event.event_type,
    occurred_at: event.occurred_at,
    source: event.source || 'biometric',
    created_by: user.id
  }))

  const { error } = await supabase
    .from('time_clock_events')
    .insert(payload)

  if (error) {
    console.error('Error inserting timesheets:', error)
    throw new Error('Failed to import timesheets: ' + error.message)
  }

  return { success: true, count: payload.length }
}
