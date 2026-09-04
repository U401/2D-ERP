import { createClient } from '@/lib/supabase/client'

/**
 * Toggle clock status with PIN verification
 * @param pin - Employee PIN (4 digits)
 */
export async function toggleClock(pin: string) {
  try {
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

    const { data, error } = await supabase.rpc('toggle_clock_by_pin', {
      p_pin: pin,
    })

    if (error) {
      console.error('Error toggling clock:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      return { success: false, error: error.message || 'Unknown database error' }
    }

    return data as { 
      success: boolean
      error?: string
      username?: string
      action?: 'clock_in' | 'clock_out'
      event_id?: string 
    }
  } catch (err) {
    console.error('Unexpected error in toggleClock:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Clock in a specific user with PIN verification (kiosk flow)
 * @param userId - Employee user ID
 * @param pin - Employee PIN (4 digits)
 */
export async function clockInForUser(userId: string, pin: string) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', eventId: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('store_id')
    .eq('id', user.id)
    .single()

  if (!profile?.store_id) {
    return { success: false, error: 'User has no store assigned', eventId: null }
  }

  const { data, error } = await supabase.rpc('clock_in_for_user', {
    p_user_id: userId,
    p_pin: pin,
  })

  if (error) {
    console.error('Error clocking in for user:', error)
    return { success: false, error: error.message, eventId: null }
  }

  return { success: true, error: null, eventId: data }
}

/**
 * Clock out a specific user with PIN verification (kiosk flow)
 * @param userId - Employee user ID
 * @param pin - Employee PIN (4 digits)
 */
export async function clockOutForUser(userId: string, pin: string) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', eventId: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('store_id')
    .eq('id', user.id)
    .single()

  if (!profile?.store_id) {
    return { success: false, error: 'User has no store assigned', eventId: null }
  }

  const { data, error } = await supabase.rpc('clock_out_for_user', {
    p_user_id: userId,
    p_pin: pin,
  })

  if (error) {
    console.error('Error clocking out for user:', error)
    return { success: false, error: error.message, eventId: null }
  }

  return { success: true, error: null, eventId: data }
}

/**
 * Check if employee is currently clocked in
 */
export async function getClockedInStatus() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: true, error: null, isClockedIn: false, clockedInAt: null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('store_id')
    .eq('id', user.id)
    .single()

  if (!profile?.store_id) {
    return { success: false, error: 'User has no store assigned', isClockedIn: false, clockedInAt: null }
  }

  const { data, error } = await supabase
    .from('v_employees_currently_clocked_in')
    .select('*')
    .eq('user_id', user.id)
    .eq('store_id', profile.store_id)
    .maybeSingle()

  if (error) {
    console.error('Error checking clock status:', error)
    return { success: false, error: error.message, isClockedIn: false, clockedInAt: null }
  }

  return {
    success: true,
    error: null,
    isClockedIn: !!data,
    clockedInAt: data?.clocked_in_at || null,
  }
}

/**
 * Fetch employee weekly schedules
 * @param userId - Employee user ID
 */
export async function getWeeklySchedules(userId: string) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', schedules: [] }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, store_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && !profile?.store_id) return { success: false, error: 'User has no store assigned', schedules: [] }

  // Non-admins can only see their own schedules
  if (profile.role !== 'admin' && user.id !== userId) {
    return { success: false, error: 'Not authorized', schedules: [] }
  }

  let query = supabase
    .from('employee_weekly_schedules')
    .select('*, profiles!user_id (username)')
    .eq('user_id', userId)

  if (profile?.role !== 'admin' && profile?.store_id) {
    query = query.eq('store_id', profile.store_id)
  }

  const { data, error } = await query.order('day_of_week')

  if (error) {
    console.error('Error fetching weekly schedules:', error)
    return { success: false, error: error.message, schedules: [] }
  }

  return { success: true, error: null, schedules: data || [] }
}

/**
 * Fetch employee schedule overrides
 * @param userId - Employee user ID
 */
export async function getScheduleOverrides(userId: string) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', overrides: [] }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, store_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && !profile?.store_id) return { success: false, error: 'User has no store assigned', overrides: [] }

  // Non-admins can only see their own overrides
  if (profile.role !== 'admin' && user.id !== userId) {
    return { success: false, error: 'Not authorized', overrides: [] }
  }

  let query = supabase
    .from('employee_schedule_overrides')
    .select('*, profiles!user_id (username)')
    .eq('user_id', userId)
    
  if (profile?.role !== 'admin' && profile?.store_id) {
    query = query.eq('store_id', profile.store_id)
  }

  const { data, error } = await query.order('work_date', { ascending: false })

  if (error) {
    console.error('Error fetching schedule overrides:', error)
    return { success: false, error: error.message, overrides: [] }
  }

  return { success: true, error: null, overrides: data || [] }
}

/**
 * Fetch currently clocked in employees (admin only)
 */
export async function getClockedInEmployees() {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', employees: [] }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, store_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { success: false, error: 'Only admins can view all clocked-in employees', employees: [] }
  }

  const { data, error } = await supabase
    .from('v_employees_currently_clocked_in')
    .select(`
      user_id,
      store_id,
      clocked_in_at,
      profiles!user_id (
        id,
        username,
        role,
        phone,
        store_id
      ),
      stores!store_id (
        id,
        name
      )
    `)
    .order('clocked_in_at', { ascending: false })

  if (error) {
    console.error('Error fetching clocked-in employees:', error)
    return { success: false, error: error.message, employees: [] }
  }

  return { success: true, error: null, employees: data || [] }
}

/**
 * Get employee schedule for a specific date
 * @param userId - Employee user ID
 * @param workDate - Date to check
 */
export async function getEmployeeScheduleForDate(userId: string, workDate: Date) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', schedule: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, store_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && !profile?.store_id) return { success: false, error: 'User has no store assigned', schedule: null }

  // Non-admins can only see their own schedule
  if (profile.role !== 'admin' && user.id !== userId) {
    return { success: false, error: 'Not authorized', schedule: null }
  }

  const { data, error } = await supabase.rpc('get_employee_schedule_for_date', {
    p_user_id: userId,
    p_work_date: workDate.toISOString().split('T')[0],
  })

  if (error) {
    console.error('Error fetching schedule for date:', error)
    return { success: false, error: error.message, schedule: null }
  }

  return { success: true, error: null, schedule: data?.[0] || null }
}

/**
 * Fetch time clock events for an employee
 * @param userId - Employee user ID
 * @param startDate - Start date range
 * @param endDate - End date range
 */
export async function getTimeClockEvents(userId: string, startDate: Date, endDate: Date) {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', events: [] }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, store_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && !profile?.store_id) return { success: false, error: 'User has no store assigned', events: [] }

  // Non-admins can only see their own events
  if (profile.role !== 'admin' && user.id !== userId) {
    return { success: false, error: 'Not authorized', events: [] }
  }

  let query = supabase
    .from('time_clock_events')
    .select('*')
    .eq('user_id', userId)
    .gte('occurred_at', startDate.toISOString())
    .lte('occurred_at', endDate.toISOString())
    
  if (profile?.role !== 'admin' && profile?.store_id) {
    query = query.eq('store_id', profile.store_id)
  }

  const { data, error } = await query.order('occurred_at', { ascending: false })

  if (error) {
    console.error('Error fetching time clock events:', error)
    return { success: false, error: error.message, events: [] }
  }

  return { success: true, error: null, events: data || [] }
}
