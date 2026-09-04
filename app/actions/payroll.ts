import { createClient } from '@/lib/supabase/client'

function getLocalDayStr(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

import { z } from 'zod'

const HourlyRateSchema = z.object({
  hourly_rate: z.number().min(0).optional().default(0),
  position_title: z.string().optional(),
  late_deduction_rate: z.number().min(0).optional().default(0),
  absence_deduction_rate: z.number().min(0).optional().default(0),
  pay_type: z.enum(['hourly', 'daily']).optional().default('hourly'),
  daily_rate: z.number().min(0).optional().default(0),
})

export async function setHourlyRate(
  userId: string,
  storeId: string,
  hourlyRate: number,
  positionTitle?: string,
  lateDeductionRate: number = 0,
  absenceDeductionRate: number = 0,
  payType: 'hourly' | 'daily' = 'hourly',
  dailyRate: number = 0
) {
  const supabase = createClient()

  try {
    const validatedData = HourlyRateSchema.parse({
      hourly_rate: hourlyRate,
      position_title: positionTitle,
      late_deduction_rate: lateDeductionRate,
      absence_deduction_rate: absenceDeductionRate,
      pay_type: payType,
      daily_rate: dailyRate
    })

    const upsertData = {
      user_id: userId,
      store_id: storeId,
      hourly_rate: validatedData.hourly_rate,
      position_title: validatedData.position_title || null,
      updated_at: new Date().toISOString(),
    } as any

    upsertData.late_deduction_rate = validatedData.late_deduction_rate
    upsertData.absence_deduction_rate = validatedData.absence_deduction_rate
    upsertData.pay_type = validatedData.pay_type
    upsertData.daily_rate = validatedData.daily_rate

    const { data, error } = await supabase
      .from('salary_rates')
      .upsert(upsertData)
      .select()
      .single()

    if (error) {
      const { data: fallback, error: err2 } = await supabase
        .from('salary_rates')
        .upsert({
          user_id: userId,
          store_id: storeId,
          hourly_rate: validatedData.hourly_rate,
          position_title: validatedData.position_title || null,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()
        
      if (err2) return { success: false, error: err2.message, salaryRate: null }
      return { success: true, error: null, salaryRate: fallback }
    }

    return { success: true, error: null, salaryRate: data }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.errors[0].message, salaryRate: null }
    }
    return { success: false, error: 'Failed to set salary rate', salaryRate: null }
  }
}

export async function getHourlyRate(userId: string) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('salary_rates')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    return { success: false, error: error.message, salaryRate: null }
  }

  return { success: true, error: null, salaryRate: data }
}

export async function calculateHoursWorked(
  userId: string,
  startDate: Date,
  endDate: Date,
  storeId?: string
) {
  const supabase = createClient()

  try {
    const rangeStart = new Date(startDate)
    rangeStart.setHours(0, 0, 0, 0)
    const rangeEnd = new Date(endDate)
    rangeEnd.setHours(23, 59, 59, 999)

          let halfDayThreshold = 120
      let fullDayThreshold = 240
      let globalGracePeriod = 15
      let halfDayDeductionPct = 50
      let fullDayDeductionPct = 100
      let standardLateDeduction = 0
      
      if (storeId) {
        const { data: store } = await supabase.from('stores').select('half_day_late_threshold_mins, full_day_late_threshold_mins, grace_period_mins, half_day_penalty_deduction_percentage, full_day_penalty_deduction_percentage, standard_late_deduction').eq('id', storeId).single()
        if (store) {
          if (store.half_day_late_threshold_mins !== undefined) halfDayThreshold = store.half_day_late_threshold_mins
          if (store.full_day_late_threshold_mins !== undefined) fullDayThreshold = store.full_day_late_threshold_mins
          if (store.grace_period_mins !== undefined) globalGracePeriod = store.grace_period_mins
          if (store.half_day_penalty_deduction_percentage !== undefined) halfDayDeductionPct = store.half_day_penalty_deduction_percentage
          if (store.full_day_penalty_deduction_percentage !== undefined) fullDayDeductionPct = store.full_day_penalty_deduction_percentage
          if (store.standard_late_deduction !== undefined) standardLateDeduction = store.standard_late_deduction
        }
      }

    const { data: events, error } = await supabase
      .from('time_clock_events')
      .select('event_type, occurred_at')
      .eq('user_id', userId)
      .gte('occurred_at', rangeStart.toISOString())
      .lte('occurred_at', rangeEnd.toISOString())
      .order('occurred_at', { ascending: true })

    if (error) {
      return { success: false, error: error.message, hoursWorked: 0, latesCount: 0, absencesCount: 0, halfDayLates: 0, fullDayLates: 0, daysWorked: 0, halfDayDeductionPct: 50, fullDayDeductionPct: 100 }
    }

    const { data: shiftBlocks } = await supabase
      .from('employee_shift_blocks')
      .select('*')
      .eq('user_id', userId)
      .eq('is_day_off', false)

    let totalMinutes = 0
    let lastClockIn: Date | null = null
    const clockInDays = new Map<string, Date[]>()

    for (const event of events || []) {
      const eventTime = new Date(event.occurred_at)
      
      if (event.event_type === 'clock_in') {
        lastClockIn = eventTime
        const dayStr = getLocalDayStr(eventTime)
        const existing = clockInDays.get(dayStr) || []
        existing.push(eventTime)
        clockInDays.set(dayStr, existing)
      } else if (event.event_type === 'clock_out' && lastClockIn) {
        const diffMinutes = (eventTime.getTime() - lastClockIn.getTime()) / (1000 * 60)
        totalMinutes += diffMinutes
        lastClockIn = null
      }
    }

    const hoursWorked = totalMinutes / 60
    let latesCount = 0
    let absencesCount = 0
    let halfDayLates = 0
    let fullDayLates = 0
    let daysWorked = clockInDays.size

    // Check each day in the date range
    const currentDay = new Date(rangeStart)
    while (currentDay <= rangeEnd) {
      const dayOfWeek = currentDay.getDay()
      const dayStr = getLocalDayStr(currentDay)
      const clockIns = clockInDays.get(dayStr) || []

      const blocksForDay = shiftBlocks?.filter(b => b.day_of_week === dayOfWeek) || []
      
      if (blocksForDay.length > 0) {
        if (clockIns.length === 0) {
          absencesCount++
        } else {
          for (const block of blocksForDay) {
            const [hours, minutes] = block.start_time.split(':').map(Number)
            const expectedStart = new Date(currentDay)
            expectedStart.setHours(hours, minutes, 0, 0)
            
            // Standard Late check (Grace Period)
            const graceEnd = new Date(expectedStart.getTime() + (globalGracePeriod * 60000))
            const halfDayEnd = new Date(expectedStart.getTime() + (halfDayThreshold * 60000))
            const fullDayEnd = new Date(expectedStart.getTime() + (fullDayThreshold * 60000))
            
            if (clockIns.length > 0) {
              const earliestClockIn = clockIns[0]
              
              if (earliestClockIn > fullDayEnd) {
                 fullDayLates++
              } else if (earliestClockIn > halfDayEnd) {
                 halfDayLates++
              } else if (earliestClockIn > graceEnd) {
                 latesCount++
              }
              break // Only check against the first block of the day for simplicity
            }
          }
        }
      }
      
      currentDay.setDate(currentDay.getDate() + 1)
    }

    return { success: true, error: null, hoursWorked, latesCount, absencesCount, halfDayLates, fullDayLates, daysWorked, halfDayDeductionPct, fullDayDeductionPct, standardLateDeduction }
  } catch (err) {
    return { success: false, error: 'Failed to calculate hours worked', hoursWorked: 0, latesCount: 0, absencesCount: 0, halfDayLates: 0, fullDayLates: 0, daysWorked: 0, halfDayDeductionPct: 50, fullDayDeductionPct: 100, standardLateDeduction: 0 }
  }
}

export async function generatePayslip(
  userId: string,
  storeId: string,
  periodStart: Date,
  periodEnd: Date
) {
  const supabase = createClient()

  try {
    const hoursResult = await calculateHoursWorked(userId, periodStart, periodEnd, storeId)
    
    if (!hoursResult.success) {
      return { success: false, error: hoursResult.error, payslip: null }
    }

    const rateResult = await getHourlyRate(userId)
    
    if (!rateResult.success || !rateResult.salaryRate) {
      return { success: false, error: 'Salary rate not set for this employee', payslip: null }
    }

    const hoursWorked = hoursResult.hoursWorked || 0
    const latesCount = hoursResult.latesCount || 0
    const absencesCount = hoursResult.absencesCount || 0
    const halfDayLates = hoursResult.halfDayLates || 0
    const fullDayLates = hoursResult.fullDayLates || 0
    const daysWorked = hoursResult.daysWorked || 0
    
    const payType = rateResult.salaryRate.pay_type || 'hourly'
    const hourlyRate = rateResult.salaryRate.hourly_rate || 0
    const dailyRate = rateResult.salaryRate.daily_rate || 0
    const standardLateDeduction = (hoursResult as any).standardLateDeduction || 0
    const absenceDeduction = rateResult.salaryRate.absence_deduction_rate || 0

    let grossPay = 0
    
    // For calculating half-day or full-day monetary penalty, we need the "daily value" of an employee.
    // If they are hourly, we might estimate a day as 8 hours * hourly rate, or just use daily_rate if set.
    const effectiveDailyValue = payType === 'daily' ? dailyRate : (hourlyRate * 8)

    if (payType === 'daily') {
      grossPay = daysWorked * dailyRate
    } else {
      grossPay = hoursWorked * hourlyRate
    }

    const halfDayPct = (hoursResult.halfDayDeductionPct || 50) / 100
      const fullDayPct = (hoursResult.fullDayDeductionPct || 100) / 100
      const lateDeductionTotal = (latesCount * standardLateDeduction) + (halfDayLates * (effectiveDailyValue * halfDayPct)) + (fullDayLates * (effectiveDailyValue * fullDayPct))
    const absenceDeductionTotal = absencesCount * absenceDeduction
    const totalDeductions = lateDeductionTotal + absenceDeductionTotal

    const netPay = Math.max(0, grossPay - totalDeductions)

    const { data, error } = await supabase
      .from('payslips')
      .insert({
        user_id: userId,
        store_id: storeId,
        period_start: periodStart.toISOString().split('T')[0],
        period_end: periodEnd.toISOString().split('T')[0],
        hours_worked: hoursWorked,
        gross_pay: grossPay,
        net_pay: netPay,
        lates_count: latesCount,
        absences_count: absencesCount,
        deductions: totalDeductions
      })
      .select()
      .single()

    if (error) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('payslips')
        .insert({
          user_id: userId,
          store_id: storeId,
          period_start: periodStart.toISOString().split('T')[0],
          period_end: periodEnd.toISOString().split('T')[0],
          hours_worked: hoursWorked,
          gross_pay: grossPay,
          net_pay: netPay,
        })
        .select()
        .single()
        
      if (fallbackError) {
        return { success: false, error: fallbackError.message, payslip: null }
      }
      
      return {
        success: true,
        error: null,
        payslip: {
          ...fallbackData,
          hourly_rate: hourlyRate,
          lates_count: latesCount,
          absences_count: absencesCount,
          deductions: totalDeductions
        } as any,
      }
    }

    return {
      success: true,
      error: null,
      payslip: {
        ...data,
        hourly_rate: hourlyRate,
      } as any,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to generate payslip'
    return { success: false, error: errorMessage, payslip: null }
  }
}

export async function getPayslips(userId?: string, storeId?: string) {
  const supabase = createClient()

  let query = supabase
    .from('payslips')
    .select(`
      *,
      user:profiles!inner (username, full_name),
      store:stores!inner (name)
    `)
    .order('created_at', { ascending: false })

  if (userId) {
    query = query.eq('user_id', userId)
  }

  // If not admin, filter by store_id
  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data, error } = await query

  if (error) {
    return { success: false, error: error.message, payslips: [] }
  }

  return { success: true, error: null, payslips: data || [] }
}

export async function getPayslipDetails(payslipId: string) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('payslips')
    .select(`
      *,
      user:profiles!inner (username, full_name),
      store:stores!inner (name)
    `)
    .eq('id', payslipId)
    .single()

  if (error) {
    return { success: false, error: error.message, payslip: null }
  }

  return { success: true, error: null, payslip: data }
}

export async function getDailyHoursBreakdown(
  userId: string,
  periodStart: Date,
  periodEnd: Date
) {
  const supabase = createClient()

  try {
    // Include the whole selected days.
    const rangeStart = new Date(periodStart)
    rangeStart.setHours(0, 0, 0, 0)
    const rangeEnd = new Date(periodEnd)
    rangeEnd.setHours(23, 59, 59, 999)

    const { data: events, error } = await supabase
      .from('time_clock_events')
      .select('event_type, occurred_at')
      .eq('user_id', userId)
      .gte('occurred_at', rangeStart.toISOString())
      .lte('occurred_at', rangeEnd.toISOString())
      .order('occurred_at', { ascending: true })

    if (error) {
      return { success: false, error: error.message, days: [] as Array<{ date: string; hours: number }> }
    }

    const byDayMinutes = new Map<string, number>()
    let lastClockIn: Date | null = null

    for (const event of events || []) {
      const eventTime = new Date(event.occurred_at)

      if (event.event_type === 'clock_in') {
        lastClockIn = eventTime
      } else if (event.event_type === 'clock_out' && lastClockIn) {
        const minutes = (eventTime.getTime() - lastClockIn.getTime()) / (1000 * 60)
        // Bucket by clock-in day for a simple daily summary.
        const dayKey = getLocalDayStr(lastClockIn)
        byDayMinutes.set(dayKey, (byDayMinutes.get(dayKey) || 0) + Math.max(0, minutes))
        lastClockIn = null
      }
    }

    const days = Array.from(byDayMinutes.entries())
      .map(([date, totalMinutes]) => ({
        date,
        hours: totalMinutes / 60,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return { success: true, error: null, days }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load daily hours',
      days: [] as Array<{ date: string; hours: number }>,
    }
  }
}








export async function getStorePayrollSettings(storeId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('stores')
    .select('half_day_late_threshold_mins, full_day_late_threshold_mins, grace_period_mins, half_day_penalty_deduction_percentage, full_day_penalty_deduction_percentage, standard_late_deduction')
    .eq('id', storeId)
    .single()
    
  if (error) return { success: false, error: error.message, settings: null }
  return { success: true, error: null, settings: data }
}

export async function updateStorePayrollSettings(storeId: string, settings: any) {
  const supabase = createClient()
  const { error } = await supabase
    .from('stores')
    .update({
      half_day_late_threshold_mins: settings.half_day_late_threshold_mins,
      full_day_late_threshold_mins: settings.full_day_late_threshold_mins,
      grace_period_mins: settings.grace_period_mins,
      half_day_penalty_deduction_percentage: settings.half_day_penalty_deduction_percentage,
      full_day_penalty_deduction_percentage: settings.full_day_penalty_deduction_percentage,
        standard_late_deduction: settings.standard_late_deduction
    })
    .eq('id', storeId)
    
  if (error) return { success: false, error: error.message }
  return { success: true, error: null }
}




export async function deletePayslip(payslipId: string) {
  const supabase = createClient()
  const { error } = await supabase.from('payslips').delete().eq('id', payslipId)
  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true, error: null }
}
