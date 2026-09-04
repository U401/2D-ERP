import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify the user calling the function is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Unauthorized - Admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { action, ...payload } = await req.json()

    if (action === 'create_user') {
      const { username, password, role } = payload
      const normalizedRole = role === 'admin' ? 'admin' : 'staff'
      const email = `${username}@erp.local`

      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, role: normalizedRole }
      })

      if (createError) throw createError

      if (newUser.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: newUser.user.id,
            username,
            role: normalizedRole
          })

        if (profileError) throw profileError
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'update_username') {
      const { userId, newUsername } = payload
      const newEmail = `${newUsername}@erp.local`

      const { error: updateError } = await supabase.auth.admin.updateUserById(
        userId,
        { email: newEmail, user_metadata: { username: newUsername } }
      )

      if (updateError) throw updateError

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ username: newUsername })
        .eq('id', userId)

      if (profileError) throw profileError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'update_password') {
      const { userId, newPassword } = payload
      if (!userId || !newPassword) {
        return new Response(JSON.stringify({ error: 'Missing userId or newPassword' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { error: pwError } = await supabase.auth.admin.updateUserById(userId, { password: newPassword })
      if (pwError) throw pwError
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'delete_user') {

      const { userId } = payload

      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (userId === user.id) {
        return new Response(JSON.stringify({ error: 'You cannot delete your own account.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Prevent deleting the last admin
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle()

      if (targetProfile?.role === 'admin') {
        const { count: adminCount } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'admin')

        if ((adminCount ?? 0) <= 1) {
          return new Response(JSON.stringify({ error: 'Cannot delete the last admin account.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      // Best-effort cleanup to avoid FK conflicts / stale presence
      await supabase.from('user_presence').delete().eq('user_id', userId)
      await supabase.from('screen_shares').delete().eq('user_id', userId)
      await supabase.from('sessions').update({ user_id: null }).eq('user_id', userId)
      await supabase.from('activity_logs').update({ user_id: null }).eq('user_id', userId)
      await supabase.from('profiles').delete().eq('id', userId)

      const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId)
      if (deleteAuthError) throw deleteAuthError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // HR: Set employee PIN (admin only)
    if (action === 'set_employee_pin') {
      const { userId, pin } = payload

      if (!userId || !pin) {
        return new Response(JSON.stringify({ error: 'Missing userId or pin' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (pin.length < 4 || pin.length > 8) {
        return new Response(JSON.stringify({ error: 'PIN must be 4-8 digits' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Use RPC to set PIN securely
      const { error: pinError } = await supabase.rpc('admin_set_employee_pin', {
        p_user_id: userId,
        p_pin: pin,
      })

      if (pinError) throw pinError

      // Log PIN change to activity logs
      try {
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action_type: 'pin_changed',
          details: {
            target_user_id: userId,
          },
        })
      } catch {
        // Ignore logging failures
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // HR: Update employee phone
    if (action === 'update_employee_phone') {
      const { userId, phone } = payload

      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { error: phoneError } = await supabase
        .from('profiles')
        .update({ phone: phone || null })
        .eq('id', userId)

      if (phoneError) throw phoneError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // HR: Create weekly schedule
    if (action === 'create_schedule') {
      const { userId, dayOfWeek, startTime, endTime, graceMinutes, unpaidBreakMinutes, isDayOff } = payload

      if (!userId || dayOfWeek === undefined || !startTime || !endTime) {
        return new Response(JSON.stringify({ error: 'Missing required fields: userId, dayOfWeek, startTime, endTime' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error: scheduleError } = await supabase
        .from('employee_weekly_schedules')
        .insert({
          user_id: userId,
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
          grace_minutes: graceMinutes || 5,
          unpaid_break_minutes: unpaidBreakMinutes || 30,
          is_day_off: isDayOff || false,
        })
        .select()
        .single()

      if (scheduleError) throw scheduleError

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // HR: List shift blocks for weekly schedule table
    if (action === 'list_shift_blocks') {
      const { userId } = payload

      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error: listError } = await supabase
        .from('employee_shift_blocks')
        .select('*')
        .eq('user_id', userId)
        .order('day_of_week')
        .order('shift_slot')

      if (listError) throw listError

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // HR: Create or upsert a shift block
    if (action === 'create_shift_block') {
      const {
        userId,
        dayOfWeek,
        shiftSlot,
        startTime,
        endTime,
        graceMinutes,
        unpaidBreakMinutes,
        isDayOff,
      } = payload

      if (!userId || dayOfWeek === undefined || !shiftSlot || !startTime || !endTime) {
        return new Response(JSON.stringify({ error: 'Missing required fields: userId, dayOfWeek, shiftSlot, startTime, endTime' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('store_id')
        .eq('id', userId)
        .maybeSingle()

      if (!profile?.store_id) {
        return new Response(JSON.stringify({ error: 'Selected user has no store assigned.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error: createShiftError } = await supabase
        .from('employee_shift_blocks')
        .upsert({
          store_id: profile.store_id,
          user_id: userId,
          day_of_week: dayOfWeek,
          shift_slot: shiftSlot,
          start_time: startTime,
          end_time: endTime,
          grace_minutes: graceMinutes || 5,
          unpaid_break_minutes: unpaidBreakMinutes || 30,
          is_day_off: isDayOff || false,
        }, {
          onConflict: 'user_id,day_of_week,shift_slot'
        })
        .select()
        .single()

      if (createShiftError) throw createShiftError

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // HR: Update a shift block by id
    if (action === 'update_shift_block') {
      const {
        shiftId,
        startTime,
        endTime,
        graceMinutes,
        unpaidBreakMinutes,
        isDayOff,
      } = payload

      if (!shiftId) {
        return new Response(JSON.stringify({ error: 'Missing shiftId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error: updateShiftError } = await supabase
        .from('employee_shift_blocks')
        .update({
          start_time: startTime,
          end_time: endTime,
          grace_minutes: graceMinutes,
          unpaid_break_minutes: unpaidBreakMinutes,
          is_day_off: isDayOff,
          updated_at: new Date().toISOString(),
        })
        .eq('id', shiftId)
        .select()
        .single()

      if (updateShiftError) throw updateShiftError

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // HR: Delete a shift block
    if (action === 'delete_shift_block') {
      const { shiftId, userId, dayOfWeek, shiftSlot } = payload

      if (!shiftId && (!userId || dayOfWeek === undefined || !shiftSlot)) {
        return new Response(JSON.stringify({ error: 'Missing shiftId or composite key' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let query = supabase.from('employee_shift_blocks').delete()
      if (shiftId) {
        query = query.eq('id', shiftId)
      } else {
        query = query
          .eq('user_id', userId)
          .eq('day_of_week', dayOfWeek)
          .eq('shift_slot', shiftSlot)
      }

      const { error: deleteShiftError } = await query

      if (deleteShiftError) throw deleteShiftError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // HR: Update weekly schedule
    if (action === 'update_schedule') {
      const { scheduleId, startTime, endTime, graceMinutes, unpaidBreakMinutes, isDayOff } = payload

      if (!scheduleId) {
        return new Response(JSON.stringify({ error: 'Missing scheduleId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error: scheduleError } = await supabase
        .from('employee_weekly_schedules')
        .update({
          start_time: startTime,
          end_time: endTime,
          grace_minutes: graceMinutes,
          unpaid_break_minutes: unpaidBreakMinutes,
          is_day_off: isDayOff,
        })
        .eq('id', scheduleId)
        .select()
        .single()

      if (scheduleError) throw scheduleError

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // HR: Delete weekly schedule
    if (action === 'delete_schedule') {
      const { scheduleId } = payload

      if (!scheduleId) {
        return new Response(JSON.stringify({ error: 'Missing scheduleId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { error: scheduleError } = await supabase
        .from('employee_weekly_schedules')
        .delete()
        .eq('id', scheduleId)

      if (scheduleError) throw scheduleError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // HR: Create schedule override
    if (action === 'create_schedule_override') {
      const { userId, workDate, startTime, endTime, graceMinutes, unpaidBreakMinutes, reason } = payload

      if (!userId || !workDate || !startTime || !endTime) {
        return new Response(JSON.stringify({ error: 'Missing required fields: userId, workDate, startTime, endTime' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error: overrideError } = await supabase
        .from('employee_schedule_overrides')
        .insert({
          user_id: userId,
          work_date: workDate,
          start_time: startTime,
          end_time: endTime,
          grace_minutes: graceMinutes || 5,
          unpaid_break_minutes: unpaidBreakMinutes || 30,
          reason: reason,
          created_by: user.id,
        })
        .select()
        .single()

      if (overrideError) throw overrideError

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // HR: Delete schedule override
    if (action === 'delete_schedule_override') {
      const { overrideId } = payload

      if (!overrideId) {
        return new Response(JSON.stringify({ error: 'Missing overrideId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { error: overrideError } = await supabase
        .from('employee_schedule_overrides')
        .delete()
        .eq('id', overrideId)

      if (overrideError) throw overrideError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message ?? String(error) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})


