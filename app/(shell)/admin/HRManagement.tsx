'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'
import { showConfirm } from '@/components/GlobalConfirm'

type Profile = {
  id: string
  username: string
  role: string
  phone: string | null
  store_id: string | null
}

type Store = {
  id: string
  name: string
}

type ClockedInEmployee = {
  user_id: string
  store_id: string
  clocked_in_at: string
  profiles: Profile
  stores: Store
}

type ScheduleOverride = {
  id: string
  user_id: string
  work_date: string
  start_time: string
  end_time: string
  grace_minutes: number
  unpaid_break_minutes: number
  reason: string | null
  profiles: Profile
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SHIFT_SLOTS = [
  { key: 'am', label: 'AM' },
  { key: 'pm', label: 'PM' },
] as const

type ShiftSlot = typeof SHIFT_SLOTS[number]['key']

type ShiftBlock = {
  id: string
  user_id: string
  day_of_week: number
  shift_slot: ShiftSlot
  start_time: string
  end_time: string
  grace_minutes: number
  unpaid_break_minutes: number
  is_day_off: boolean
}

type ShiftDraft = {
  start_time: string
  end_time: string
  grace_minutes: number
  unpaid_break_minutes: number
  is_day_off: boolean
}

type AttendanceStatus = 'on-time' | 'late' | 'early' | 'no-schedule'

  function formatTime12Hour(time24: string): string {
    if (!time24 || time24 === '00:00') return '--:-- --'
    const trimmed = time24.trim()
    
    // If already in 12h format (has AM/PM), return as-is
    if (trimmed.includes('AM') || trimmed.includes('PM')) {
      return trimmed
    }
    
    // Parse 24h format and convert to 12h
    const [hours, minutes] = trimmed.split(':').map(Number)
    const period = hours >= 12 ? 'PM' : 'AM'
    const hours12 = hours % 12 || 12
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
  }

export default function HRManagement() {
  const [clockedIn, setClockedIn] = useState<ClockedInEmployee[]>([])
  const [clockedInError, setClockedInError] = useState<string | null>(null)
  const [shiftBlocks, setShiftBlocks] = useState<ShiftBlock[]>([])
  const [shiftDrafts, setShiftDrafts] = useState<Record<string, ShiftDraft>>({})
  const [overrides, setOverrides] = useState<ScheduleOverride[]>([])
  const [employees, setEmployees] = useState<Profile[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [activeTab, setActiveTab] = useState<'clockedIn' | 'schedules'>('clockedIn')
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null)
  const [showPinModal, setShowPinModal] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [shiftEditModal, setShiftEditModal] = useState<{ dayOfWeek: number; slot: ShiftSlot } | null>(null)
  const supabase = createClient()
  const router = useRouter()
  useEffect(() => {
    // Reset selection when tab changes away from schedules
    if (activeTab !== 'schedules') {
      setSelectedEmployee(null)
      setShiftDrafts({})
      setShiftEditModal(null)
    }
  }, [activeTab])

  async function getFunctionErrorMessage(error: unknown, fallback: string) {
    if (!error) return fallback

    let message = fallback
    if (typeof error === 'string') {
      message = error
    } else if (error instanceof Error) {
      message = error.message || fallback
    }

    const context = (error as { context?: Response })?.context
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json()
        if (body?.error) return body.error
        if (body?.message) return body.message
      } catch {
        // ignore JSON parsing errors
      }
    }

    return message
  }

  const fetchShiftBlocks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('employee_shift_blocks')
        .select('*')
      if (error) {
        console.error('HR: Error fetching shift blocks:', JSON.stringify(error, null, 2))
      } else {
        setShiftBlocks(data as any)
      }
    } catch (err) {
      console.error('HR: Exception in fetchShiftBlocks:', err)
    }
  }, [supabase])

  useEffect(() => {
    async function loadData() {
      console.log('HR: Loading data...')
      try {
        setClockedInError(null)
        // Fetch currently clocked-in employees
        // Query the table directly to avoid potential view/PostgREST issues
        const { data: rawEvents, error: clockError } = await supabase
          .from('time_clock_events')
          .select('user_id, store_id, occurred_at, event_type')
          .order('user_id')
          .order('occurred_at', { ascending: false })

        if (clockError) {
          console.error('HR: clockError:', clockError)
          throw clockError
        }

        // Filter for last 'clock_in' in JavaScript
        const lastEvents = new Map()
        rawEvents?.forEach(event => {
          if (!lastEvents.has(event.user_id)) {
            lastEvents.set(event.user_id, event)
          }
        })

        const currentlyClockedIn = Array.from(lastEvents.values())
          .filter(e => e.event_type === 'clock_in')

        if (currentlyClockedIn.length > 0) {
          const userIds = currentlyClockedIn.map(c => c.user_id)
          const storeIds = currentlyClockedIn.map(c => c.store_id).filter(Boolean)

          // Fetch profiles and stores in parallel
          const [profilesRes, storesRes] = await Promise.all([
            supabase.from('profiles').select('id, username, role, phone, store_id').in('id', userIds),
            supabase.from('stores').select('id, name').in('id', storeIds)
          ])

          if (profilesRes.error) console.error('HR: profilesRes.error:', profilesRes.error)
          if (storesRes.error) console.error('HR: storesRes.error:', storesRes.error)

          const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p]))
          const storeMap = new Map((storesRes.data || []).map(s => [s.id, s]))

          const enrichedClocked = currentlyClockedIn.map(c => ({
            ...c,
            clocked_in_at: c.occurred_at,
            profiles: profileMap.get(c.user_id) || { id: c.user_id, username: 'Unknown User', role: 'user', phone: null, store_id: c.store_id },
            stores: storeMap.get(c.store_id || '') || { id: c.store_id || '', name: 'Unknown Store' }
          }))

          console.log('HR: Clocked-in data enriched:', enrichedClocked)
          setClockedIn(enrichedClocked as any)
        } else {
          setClockedIn([])
        }

        // Fetch ALL shift blocks for the status indicators and schedule management
        await fetchShiftBlocks()

        // Fetch profiles for schedule management
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, role, phone, store_id')
          .not('role', 'eq', 'admin')
          .order('username')

        if (profilesError) {
          console.error('HR: profilesError:', profilesError)
          throw profilesError
        }
        setEmployees(profilesData as any)

        // Fetch stores
        const { data: storesData, error: storesError } = await supabase
          .from('stores')
          .select('*')
          .order('name')

        if (storesError) {
          console.error('HR: storesError:', storesError)
          throw storesError
        }
        setStores(storesData as any)

      } catch (err: any) {
        console.error('HR: Fatal error in loadData:', err)
        setClockedInError(err.message || 'An unexpected error occurred while loading HR data.')
      }
    }

    loadData()

    // Subscribe to time clock events for real-time updates
    const channel = supabase
      .channel('time_clock_events_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'time_clock_events',
        },
        (payload) => {
          console.log('HR: Real-time update received for time_clock_events:', payload)
          loadData()
        }
      )
      .subscribe((status) => {
        console.log('HR: Real-time channel status:', status)
      })

    return () => {
      console.log('HR: Cleaning up real-time channel')
      supabase.removeChannel(channel)
    }
  }, [supabase])

  const loadOverrides = useCallback(async () => {
    if (!selectedEmployee) return

    try {
      const { data: overridesData, error } = await supabase
        .from('employee_schedule_overrides')
        .select('*')
        .eq('user_id', selectedEmployee)
        .order('work_date', { ascending: false })

      if (error) throw error

      if (overridesData && overridesData.length > 0) {
        // Enrich with profiles (for username)
        const userIds = Array.from(new Set(overridesData.map(o => o.user_id)))
        const { data: profileData } = await supabase.from('profiles').select('id, username').in('id', userIds)
        const profileMap = new Map(profileData?.map(p => [p.id, p]))
        
        const enriched = overridesData.map(o => ({
          ...o,
          profiles: profileMap.get(o.user_id)
        }))
        setOverrides(enriched as any)
      } else {
        setOverrides([])
      }
    } catch (err) {
      console.error('HR: Error loading overrides:', err)
    }
  }, [selectedEmployee, supabase])

  useEffect(() => {
    loadOverrides()
    fetchShiftBlocks()
  }, [loadOverrides, fetchShiftBlocks])

  const shiftBlockMap = useMemo(() => {
    const map = new Map<string, ShiftBlock>()
    shiftBlocks.forEach((block) => {
      map.set(`${block.user_id}-${block.day_of_week}-${block.shift_slot}`, block)
    })
    return map
  }, [shiftBlocks])

  function defaultDraftForSlot(slot: ShiftSlot): ShiftDraft {
    if (slot === 'am') {
      return {
        start_time: '08:00',
        end_time: '12:00',
        grace_minutes: 0,
        unpaid_break_minutes: 0,
        is_day_off: false,
      }
    }
    return {
      start_time: '13:00',
      end_time: '17:00',
      grace_minutes: 0,
      unpaid_break_minutes: 0,
      is_day_off: false,
    }
  }

  useEffect(() => {
    if (!selectedEmployee) {
      setShiftDrafts({})
      return
    }

    const drafts: Record<string, ShiftDraft> = {}
    DAY_NAMES.forEach((_, dayOfWeek) => {
      SHIFT_SLOTS.forEach((slot) => {
        const key = `${dayOfWeek}-${slot.key}`
        const shiftKey = `${selectedEmployee}-${dayOfWeek}-${slot.key}`
        const existing = shiftBlockMap.get(shiftKey)
        drafts[key] = existing
          ? {
              start_time: existing.start_time,
              end_time: existing.end_time,
              grace_minutes: existing.grace_minutes,
              unpaid_break_minutes: existing.unpaid_break_minutes,
              is_day_off: existing.is_day_off,
            }
          : defaultDraftForSlot(slot.key)
      })
    })

    setShiftDrafts(drafts)
  }, [selectedEmployee, shiftBlockMap])

  function getAttendanceStatus(clockedInAt: string, scheduledStart: string, graceMinutes: number): AttendanceStatus {
    const clockInTime = new Date(clockedInAt)
    const [startHours, startMins] = scheduledStart.split(':').map(Number)
    
    // Create a date object for the clock-in day at the scheduled start time
    const scheduledStartTime = new Date(clockInTime)
    scheduledStartTime.setHours(startHours, startMins, 0, 0)
    
    const allowedStart = new Date(scheduledStartTime.getTime() + graceMinutes * 60 * 1000)
    
    if (clockInTime < scheduledStartTime) {
      return 'early'
    } else if (clockInTime <= allowedStart) {
      return 'on-time'
    } else {
      return 'late'
    }
  }

  async function handleSetPin(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedEmployee) return

    setLoading(true)
    setMessage(null)

    if (pinInput.length < 4 || pinInput.length > 8) {
      setMessage({ type: 'error', text: 'PIN must be 4-8 digits' })
      setLoading(false)
      return
    }

    if (pinInput !== pinConfirm) {
      setMessage({ type: 'error', text: 'PIN confirmation does not match' })
      setLoading(false)
      return
    }

    const { data, error } = await supabase.functions.invoke('admin-actions', {
      body: { action: 'set_employee_pin', userId: selectedEmployee, pin: pinInput }
    })

    if (error || data?.error) {
      const message = data?.error
        ? data.error
        : await getFunctionErrorMessage(error, 'Failed to set PIN')
      setMessage({ type: 'error', text: message })
    } else {
      setMessage({ type: 'success', text: 'PIN set successfully!' })
      setPinInput('')
      setPinConfirm('')
      setShowPinModal(false)
      setTimeout(() => setMessage(null), 3000)
    }

    setLoading(false)
  }

  async function handleUpdatePhone(phone: string) {
    if (!selectedEmployee) return

    setLoading(true)
    setMessage(null)

    const { data, error } = await supabase.functions.invoke('admin-actions', {
      body: { action: 'update_employee_phone', userId: selectedEmployee, phone }
    })

    if (error || data?.error) {
      const message = data?.error
        ? data.error
        : await getFunctionErrorMessage(error, 'Failed to update phone')
      setMessage({ type: 'error', text: message })
    } else {
      setMessage({ type: 'success', text: 'Phone number updated!' })
      setTimeout(() => setMessage(null), 3000)
    }

    setLoading(false)
  }

  function updateShiftDraft(dayOfWeek: number, slot: ShiftSlot, patch: Partial<ShiftDraft>) {
    const key = `${dayOfWeek}-${slot}`
    setShiftDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || defaultDraftForSlot(slot)),
        ...patch,
      },
    }))
  }

  async function handleSaveShiftBlock(dayOfWeek: number, slot: ShiftSlot) {
    if (!selectedEmployee) return

    const key = `${dayOfWeek}-${slot}`
    const draft = shiftDrafts[key] || defaultDraftForSlot(slot)
    if (!draft) return

    setLoading(true)
    setMessage(null)

    const existing = shiftBlockMap.get(`${selectedEmployee}-${dayOfWeek}-${slot}`)
    const payload = {
      startTime: draft.is_day_off ? '00:00' : draft.start_time,
      endTime: draft.is_day_off ? '00:00' : draft.end_time,
      graceMinutes: draft.grace_minutes,
      unpaidBreakMinutes: draft.unpaid_break_minutes,
      isDayOff: draft.is_day_off,
    }

    if (existing) {
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: {
          action: 'update_shift_block',
          shiftId: existing.id,
          ...payload,
        }
      })
      if (error || data?.error) {
        setMessage({ type: 'error', text: data?.error || error?.message || 'Failed to update shift.' })
        setLoading(false)
        return
      }
    } else {
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: {
          action: 'create_shift_block',
          userId: selectedEmployee,
          dayOfWeek,
          shiftSlot: slot,
          ...payload,
        }
      })
      if (error || data?.error) {
        setMessage({ type: 'error', text: data?.error || error?.message || 'Failed to create shift.' })
        setLoading(false)
        return
      }
    }

    await fetchShiftBlocks()
    setMessage({ type: 'success', text: `Saved ${DAY_NAMES[dayOfWeek]} ${slot.toUpperCase()} shift.` })
    setTimeout(() => setMessage(null), 3000)
    setLoading(false)
  }

  async function handleClearShiftBlock(dayOfWeek: number, slot: ShiftSlot) {
    if (!selectedEmployee) return

    const key = `${dayOfWeek}-${slot}`
    const existing = shiftBlockMap.get(`${selectedEmployee}-${dayOfWeek}-${slot}`)

    if (existing) {
      if (!(await showConfirm(`Clear ${DAY_NAMES[dayOfWeek]} ${slot.toUpperCase()} shift?`))) return
      setLoading(true)
      setMessage(null)
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: { action: 'delete_shift_block', shiftId: existing.id }
      })
      if (error || data?.error) {
        setMessage({ type: 'error', text: data?.error || error?.message || 'Failed to clear shift.' })
        setLoading(false)
        return
      }
      await fetchShiftBlocks()
      setMessage({ type: 'success', text: `Cleared ${DAY_NAMES[dayOfWeek]} ${slot.toUpperCase()} shift.` })
      setTimeout(() => setMessage(null), 3000)
      setLoading(false)
    } else {
      updateShiftDraft(dayOfWeek, slot, defaultDraftForSlot(slot))
    }
  }

  function openShiftEditModal(dayOfWeek: number, slot: ShiftSlot) {
    setShiftEditModal({ dayOfWeek, slot })
  }

  async function handleShiftEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!shiftEditModal || !selectedEmployee) return

    const { dayOfWeek, slot } = shiftEditModal
    const key = `${dayOfWeek}-${slot}`
    const draft = shiftDrafts[key] || defaultDraftForSlot(slot)
    
    setLoading(true)
    setMessage(null)

    const existing = shiftBlockMap.get(`${selectedEmployee}-${dayOfWeek}-${slot}`)
    const payload = {
      startTime: draft.is_day_off ? '00:00' : draft.start_time,
      endTime: draft.is_day_off ? '00:00' : draft.end_time,
      graceMinutes: draft.grace_minutes,
      unpaidBreakMinutes: draft.unpaid_break_minutes,
      isDayOff: draft.is_day_off,
    }

    if (existing) {
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: {
          action: 'update_shift_block',
          shiftId: existing.id,
          ...payload,
        }
      })
      if (error || data?.error) {
        setMessage({ type: 'error', text: data?.error || error?.message || 'Failed to update shift.' })
        setLoading(false)
        return
      }
    } else {
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: {
          action: 'create_shift_block',
          userId: selectedEmployee,
          dayOfWeek,
          shiftSlot: slot,
          ...payload,
        }
      })
      if (error || data?.error) {
        setMessage({ type: 'error', text: data?.error || error?.message || 'Failed to create shift.' })
        setLoading(false)
        return
      }
    }

    await fetchShiftBlocks()
    setMessage({ type: 'success', text: `Saved ${DAY_NAMES[dayOfWeek]} ${slot.toUpperCase()} shift.` })
    setShiftEditModal(null)
    setTimeout(() => setMessage(null), 3000)
    setLoading(false)
  }

  async function handleCreateOverride(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedEmployee) return

    const formData = new FormData(e.currentTarget)
    const workDate = formData.get('workDate') as string
    const startTime = formData.get('startTime') as string
    const endTime = formData.get('endTime') as string
    const graceMinutes = parseInt(formData.get('graceMinutes') as string)
    const unpaidBreakMinutes = parseInt(formData.get('unpaidBreakMinutes') as string)
    const reason = formData.get('reason') as string

    setLoading(true)
    setMessage(null)

    const { data, error } = await supabase.functions.invoke('admin-actions', {
      body: {
        action: 'create_schedule_override',
        userId: selectedEmployee,
        workDate,
        startTime,
        endTime,
        graceMinutes,
        unpaidBreakMinutes,
        reason,
      }
    })

    if (error || data?.error) {
      const message = data?.error
        ? data.error
        : await getFunctionErrorMessage(error, 'Failed to create override')
      setMessage({ type: 'error', text: message })
    } else {
      setMessage({ type: 'success', text: 'Override created!' })
      e.currentTarget.reset()
      setTimeout(() => setMessage(null), 3000)
    }

    setLoading(false)
  }

  async function handleDeleteOverride(overrideId: string) {
    if (!(await showConfirm('Delete this override?'))) return

    setLoading(true)
    setMessage(null)

    const { data, error } = await supabase.functions.invoke('admin-actions', {
      body: { action: 'delete_schedule_override', overrideId }
    })

    if (error || data?.error) {
      const message = data?.error
        ? data.error
        : await getFunctionErrorMessage(error, 'Failed to delete override')
      setMessage({ type: 'error', text: message })
    } else {
      setMessage({ type: 'success', text: 'Override deleted!' })
      setTimeout(() => setMessage(null), 3000)
    }

    setLoading(false)
  }

  const employee = employees.find(e => e.id === selectedEmployee)
  const filteredEmployees = employees.filter((emp) =>
    !staffSearch
      ? true
      : emp.username.toLowerCase().includes(staffSearch.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {message && (
        <div className={`rounded-lg border p-4 ${
          message.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-900'
            : 'border-red-200 bg-red-50 text-red-900'
        }`}>
          {message.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">HR Management</h1>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-lg p-2">
        <div className="flex gap-2">
          {[
            { key: 'clockedIn', label: 'Clocked In' },
            { key: 'schedules', label: 'Weekly Schedules' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`px-4 py-2 rounded-lg text-base font-semibold transition-colors ${
                activeTab === key
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Clocked In Tab */}
      {activeTab === 'clockedIn' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Currently Clocked In</h2>
          
          {clockedInError && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Unable to load clocked-in employees.</p>
              <p className="mt-1 text-xs text-amber-800">
                Error: {clockedInError}. This usually means HR tables haven't been applied in Supabase yet.
                Please run migration 0024 in Supabase SQL Editor.
              </p>
            </div>
          )}

          {clockedIn.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p className="text-lg font-medium">No employees currently clocked in</p>
              <p className="text-sm mt-2">Clocked-in employees will appear here when they clock in via PIN</p>
            </div>
          ) : (
            <div className="space-y-3">
              {clockedIn.map((employee) => {
                const clockInDate = new Date(employee.clocked_in_at)
                const dayOfWeek = clockInDate.getDay()
                const clockInHour = clockInDate.getHours()
                const slotKey = clockInHour < 12 ? 'am' : 'pm'
                const shiftKey = `${employee.user_id}-${dayOfWeek}-${slotKey}`
                const scheduledShift = shiftBlockMap.get(shiftKey)
                
                let status: AttendanceStatus = 'no-schedule'
                let statusText = ''
                let statusColor = ''

                if (scheduledShift && !scheduledShift.is_day_off) {
                  status = getAttendanceStatus(employee.clocked_in_at, scheduledShift.start_time, scheduledShift.grace_minutes)
                  if (status === 'on-time') {
                    statusText = 'On Time'
                    statusColor = 'bg-green-100 text-green-800'
                  } else if (status === 'late') {
                    statusText = 'Late'
                    statusColor = 'bg-red-100 text-red-800'
                  } else if (status === 'early') {
                    statusText = 'Early'
                    statusColor = 'bg-indigo-100 text-indigo-800'
                  }
                } else {
                  // Fallback: Check the other slot for the same day if current one is empty
                  const otherSlot = slotKey === 'am' ? 'pm' : 'am'
                  const otherShift = shiftBlockMap.get(`${employee.user_id}-${dayOfWeek}-${otherSlot}`)
                  
                  if (otherShift && !otherShift.is_day_off) {
                    status = getAttendanceStatus(employee.clocked_in_at, otherShift.start_time, otherShift.grace_minutes)
                    if (status === 'on-time') {
                      statusText = 'On Time'
                      statusColor = 'bg-green-100 text-green-800'
                    } else if (status === 'late') {
                      statusText = 'Late'
                      statusColor = 'bg-red-100 text-red-800'
                    } else if (status === 'early') {
                      statusText = 'Early'
                      statusColor = 'bg-indigo-100 text-indigo-800'
                    }
                  } else {
                    statusText = 'No Schedule'
                    statusColor = 'bg-gray-100 text-gray-600'
                  }
                }

                return (
                  <div
                    key={employee.user_id}
                    className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                        {employee.profiles?.username?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="flex flex-col">
                        <p className="font-semibold text-slate-900">
                          {employee.profiles?.username || 'Unknown'}
                        </p>
                        {employee.profiles?.phone && (
                          <p className="text-sm text-slate-600">
                            {employee.profiles.phone}
                          </p>
                        )}
                        <p className="text-xs text-slate-500">
                          {employee.stores?.name || 'Unknown Store'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                          {statusText}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-green-600">
                        Clocked in {formatDistanceToNow(new Date(employee.clocked_in_at), { addSuffix: true })}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(employee.clocked_in_at).toLocaleString('en-US', {
                          hour: 'numeric',
                          hour12: true,
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Weekly Schedules Tab */}
      {activeTab === 'schedules' && (
        <div className="space-y-4">
          {/* Employee Selection */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Select Employee</h3>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search staff..."
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    className="w-64 pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-400 focus:outline-none"
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
              </div>
              {filteredEmployees.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No staff found.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredEmployees.map((emp) => {
                    const isSelected = selectedEmployee === emp.id
                    return (
                      <div
                        key={emp.id}
                        onClick={() => setSelectedEmployee(emp.id)}
                        className={`relative p-5 rounded-xl border-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-slate-900 bg-slate-50 shadow-md'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white font-bold text-xl shadow-sm">
                            {emp.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <p className="text-base font-semibold text-slate-900">{emp.username}</p>
                            <p className="text-sm text-slate-500">{emp.role}</p>
                            {emp.phone && <p className="text-sm text-slate-600">{emp.phone}</p>}
                          </div>
                        </div>
                        {isSelected && (
                          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowPinModal(true);
                              }}
                              className="w-full px-3 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium text-sm"
                            >
                              Set PIN
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const phone = prompt('Enter phone number:');
                                if (phone) handleUpdatePhone(phone);
                              }}
                              className="w-full px-3 py-2 bg-button-gray text-slate-900 rounded-lg hover:bg-[#D0D0D0] transition-colors font-medium text-sm border border-slate-200"
                            >
                              Update Phone
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/admin?tab=payroll&employee=${emp.id}`);
                              }}
                              className="w-full px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
                            >
                              Manage Payroll
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEmployee(null);
                                setShiftDrafts({});
                                setShiftEditModal(null);
                              }}
                              className="w-full px-3 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm"
                            >
                              Close
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {selectedEmployee && employee && (
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm text-slate-600">
                    Viewing schedule for <span className="font-medium text-slate-900">{employee.username}</span>
                    {employee.phone && ` (${employee.phone})`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEmployee(null)}
                  className="px-3 py-1.5 text-sm text-slate-900 bg-button-gray border border-slate-200 rounded-lg hover:bg-[#D0D0D0] transition-colors"
                >
                  Change Employee
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Weekly Schedule</h3>
                  <p className="text-sm text-slate-500">
                    Edit AM and PM shifts. Click a shift to see more options.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full min-w-[500px]">
                    <thead className="bg-slate-50/50">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Day</th>
                        {SHIFT_SLOTS.map((slot) => (
                          <th key={slot.key} className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                            {slot.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {DAY_NAMES.map((day, dayOfWeek) => (
                        <tr key={day} className="hover:bg-slate-50/30 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-800 text-sm">
                            {day}
                          </td>
                          {SHIFT_SLOTS.map((slot) => {
                            const key = `${selectedEmployee}-${dayOfWeek}-${slot.key}`
                            const draft = shiftDrafts[`${dayOfWeek}-${slot.key}`] || defaultDraftForSlot(slot.key)
                            const isDayOff = draft.is_day_off
                            const exists = shiftBlockMap.has(key)
                                                          return (
                                <td key={slot.key} className="px-3 py-3">
                                  <button
                                    type="button"
                                    onClick={() => openShiftEditModal(dayOfWeek, slot.key)}
                                    className={`w-full text-center px-3 py-2.5 rounded-lg border transition-all ${
                                      exists
                                        ? isDayOff
                                          ? 'border-orange-200 bg-orange-50 text-orange-700 hover:border-orange-300'
                                          : 'border-green-200 bg-green-50 text-green-700 hover:border-green-300'
                                        : 'border-dashed border-slate-300 bg-transparent text-slate-400 hover:border-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                    }`}
                                  >
                                    <div className="flex items-center justify-center">
                                      {exists ? (
                                        <span className="text-sm font-semibold">
                                          {isDayOff ? 'Day Off' : `${formatTime12Hour(draft.start_time)} - ${formatTime12Hour(draft.end_time)}`}
                                        </span>
                                      ) : (
                                        <span className="text-sm font-medium italic">
                                          + Add Shift
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                </td>
                              )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PIN Modal */}
      {showPinModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-slate-900 mb-4">
              Set PIN for {employee?.username}
            </h3>
            <form onSubmit={handleSetPin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Enter 4-8 digit PIN
                </label>
                <input
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  maxLength={8}
                  placeholder="****"
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-slate-900 focus:outline-none text-center text-2xl tracking-widest"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Confirm PIN
                </label>
                <input
                  type="password"
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value)}
                  maxLength={8}
                  placeholder="****"
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-slate-900 focus:outline-none text-center text-2xl tracking-widest"
                  required
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowPinModal(false)
                    setPinInput('')
                    setPinConfirm('')
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium disabled:opacity-50"
                >
                  {loading ? 'Setting...' : 'Set PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shift Edit Modal */}
      {shiftEditModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {DAY_NAMES[shiftEditModal.dayOfWeek]} — {shiftEditModal.slot.toUpperCase()} Shift
              </h3>
              <button
                type="button"
                onClick={() => setShiftEditModal(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleShiftEditSave} className="space-y-5">
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Work Hours
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        step="3600"
                        value={(shiftDrafts[`${shiftEditModal.dayOfWeek}-${shiftEditModal.slot}`] || defaultDraftForSlot(shiftEditModal.slot)).start_time}
                        onChange={(e) => updateShiftDraft(shiftEditModal.dayOfWeek, shiftEditModal.slot, { start_time: e.target.value })}
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-400 focus:outline-none transition-all"
                      />
                      <span className="text-slate-400">to</span>
                      <input
                        type="time"
                        step="3600"
                        value={(shiftDrafts[`${shiftEditModal.dayOfWeek}-${shiftEditModal.slot}`] || defaultDraftForSlot(shiftEditModal.slot)).end_time}
                        onChange={(e) => updateShiftDraft(shiftEditModal.dayOfWeek, shiftEditModal.slot, { end_time: e.target.value })}
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-400 focus:outline-none transition-all"
                      />
                    </div>
                  </div>
              
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(shiftDrafts[`${shiftEditModal.dayOfWeek}-${shiftEditModal.slot}`] || defaultDraftForSlot(shiftEditModal.slot)).is_day_off}
                    onChange={(e) => updateShiftDraft(shiftEditModal.dayOfWeek, shiftEditModal.slot, { is_day_off: e.target.checked })}
                    className="w-4 h-4 border-slate-300 rounded focus:ring-2 focus:ring-slate-900"
                  />
                  Day Off
                </label>
                <button
                  type="button"
                  onClick={() => handleClearShiftBlock(shiftEditModal.dayOfWeek, shiftEditModal.slot)}
                  className="px-4 py-2 text-sm text-slate-900 bg-button-gray rounded-lg hover:bg-[#D0D0D0] transition-colors border border-slate-200"
                >
                  Clear
                </button>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShiftEditModal(null)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
