'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import BiometricImporter from '@/components/BiometricImporter'
import { registerFingerprint } from '@/app/actions/webauthn'
import {
  setHourlyRate,
  calculateHoursWorked,
  generatePayslip,
  getPayslips,
  getDailyHoursBreakdown,
  getStorePayrollSettings,
  updateStorePayrollSettings,
  deletePayslip,
} from '@/app/actions/payroll'

type SalaryRate = {
  user_id: string
  store_id: string
  hourly_rate: number
  position_title: string | null
  pay_type?: 'hourly' | 'daily'
  daily_rate?: number
  late_deduction_rate?: number
  absence_deduction_rate?: number
  updated_at: string
}

type Payslip = {
  id: string
  user_id: string
  store_id: string
  period_start: string
  period_end: string
  hours_worked: number
  gross_pay: number
  net_pay: number
  lates_count?: number
  absences_count?: number
  deductions?: number
  created_at: string
  user: {
    username: string | null
    full_name: string
  }
  store: {
    name: string
  }
}

type Employee = {
  id: string
  username: string | null
  role: string | null
  full_name: string | null
  store_id: string | null
}

type PayrollPageProps = {
  initialProfiles?: Array<{
    id: string
    username?: string | null
    role?: string | null
    full_name?: string | null
    store_id?: string | null
  }>
}

export default function PayrollPage({ initialProfiles = [] }: PayrollPageProps) {
  const searchParams = useSearchParams()
  const queryEmployeeId = searchParams.get('employee')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [salaryRates, setSalaryRates] = useState<Record<string, SalaryRate>>({})
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null)
  const [showRateModal, setShowRateModal] = useState(false)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showPayslipModal, setShowPayslipModal] = useState(false)
  const [showImporter, setShowImporter] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDailyHours, setShowDailyHours] = useState(false)
  const [dailyHoursLoading, setDailyHoursLoading] = useState(false)
  const [dailyHoursRows, setDailyHoursRows] = useState<Array<{ date: string; hours: number }>>([])
    const [fingerprintLoading, setFingerprintLoading] = useState<string | null>(null)
  
  // Set rate form
  const [rateFormData, setRateFormData] = useState({
    hourly_rate: '',
    position_title: '',
    late_deduction_rate: '',
    absence_deduction_rate: '',
    pay_type: 'hourly',
    daily_rate: '',
  })
  
      const [storeSettings, setStoreSettings] = useState({ half_day_late_threshold_mins: 120, full_day_late_threshold_mins: 240, grace_period_mins: 15, half_day_penalty_deduction_percentage: 50, full_day_penalty_deduction_percentage: 100, standard_late_deduction: 0 })
    const [isSavingSettings, setIsSavingSettings] = useState(false)
    const [storeId, setStoreId] = useState('')
    const [stores, setStores] = useState<Array<{id: string, name: string}>>([])
    const [userRole, setUserRole] = useState('')

        const [halfDayUnit, setHalfDayUnit] = useState('minutes')
    const [fullDayUnit, setFullDayUnit] = useState('minutes')

    // Generate payslip form
  const [generateFormData, setGenerateFormData] = useState({
    period_start: '',
    period_end: '',
  })
  
  const [hoursWorked, setHoursWorked] = useState(0)

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (!queryEmployeeId || employees.length === 0) return
    const employeeFromQuery = employees.find((e) => e.id === queryEmployeeId)
    if (employeeFromQuery) {
      setSelectedEmployee(employeeFromQuery)
    }
  }, [queryEmployeeId, employees])

    async function loadInitialData() {
    setIsLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('store_id, role')
        .eq('id', user.id)
        .single()
      
      if (profile) {
        setUserRole(profile.role || '')
        
        let initialStoreId = profile.store_id
        
        if (profile.role === 'admin') {
          const { data: allStores } = await supabase.from('stores').select('id, name').order('name')
          if (allStores && allStores.length > 0) {
            setStores(allStores)
            if (!initialStoreId) {
               initialStoreId = allStores[0].id
            }
          }
        }
        
        if (initialStoreId) {
          setStoreId(initialStoreId)
          await loadStoreData(initialStoreId, profile.role || '')
        }
      }
    }
    setIsLoading(false)
  }

  async function loadStoreData(targetStoreId: string, role: string) {
    setIsLoading(true)
    const settingsRes = await getStorePayrollSettings(targetStoreId)
    if (settingsRes.success && settingsRes.settings) {
      setStoreSettings({
        half_day_late_threshold_mins: settingsRes.settings.half_day_late_threshold_mins || 120,
        full_day_late_threshold_mins: settingsRes.settings.full_day_late_threshold_mins || 240,
        grace_period_mins: settingsRes.settings.grace_period_mins || 15,
        half_day_penalty_deduction_percentage: settingsRes.settings.half_day_penalty_deduction_percentage || 50,
        full_day_penalty_deduction_percentage: settingsRes.settings.full_day_penalty_deduction_percentage || 100,
          standard_late_deduction: settingsRes.settings.standard_late_deduction || 0
      })
    }
    await Promise.all([
      loadEmployees(targetStoreId, role),
      loadSalaryRates(targetStoreId, role),
      loadPayslips(targetStoreId, role)
    ])
    setIsLoading(false)
  }

  async function loadEmployees(storeId: string | null, role: string) {
    if (initialProfiles.length > 0) {
      const normalized = initialProfiles
        .map((profile) => ({
          id: profile.id,
          username: profile.username ?? null,
          role: profile.role ?? null,
          full_name: profile.full_name ?? null,
          store_id: profile.store_id ?? null,
        }))
        .filter((employee) => employee.role !== 'admin')

      setEmployees(normalized)
      return
    }

    const supabase = createClient()
    let query = supabase.from('profiles').select('id, username, role, full_name, store_id')
    
    if (role !== 'admin' && storeId) {
      query = query.eq('store_id', storeId)
    }
    
    const { data } = await query.order('username')
    if (data) {
      // Payroll employee list should only contain staff accounts.
      setEmployees(data.filter((employee) => employee.role !== 'admin'))
    }
  }

  async function loadSalaryRates(storeId: string | null, role: string) {
    const supabase = createClient()
    let query = supabase.from('salary_rates').select('*')
    
    if (role !== 'admin' && storeId) {
      query = query.eq('store_id', storeId)
    }
    
    const { data } = await query
    const ratesMap: Record<string, SalaryRate> = {}
    if (data) {
      data.forEach((rate: SalaryRate) => {
        ratesMap[rate.user_id] = rate
      })
    }
    setSalaryRates(ratesMap)
  }

  async function loadPayslips(storeId: string | null, role: string) {
    const result = await getPayslips(undefined, role === 'admin' ? undefined : (storeId || undefined))
    if (result.success) {
      setPayslips(result.payslips)
    }
  }

  async function handleRegisterFingerprint(employee: any) {
      setFingerprintLoading(employee.id)
      setError(null)
      const res = await registerFingerprint(employee.id, employee.username)
      if (!res.success) {
        setError(res.error || 'Failed to register fingerprint')
      } else {
        alert('Fingerprint registered successfully!')
      }
      setFingerprintLoading(null)
    }

    async function handleSetRate(e: React.FormEvent) {
    e.preventDefault()
    
    if (!selectedEmployee || !selectedEmployee.store_id) {
      setError('Employee must be assigned to a store')
      return
    }

    setIsLoading(true)
    setError(null)

    const result = await setHourlyRate(
      selectedEmployee.id,
      selectedEmployee.store_id,
      parseFloat(rateFormData.hourly_rate) || 0,
      rateFormData.position_title || undefined,
      parseFloat(rateFormData.late_deduction_rate) || 0,
      parseFloat(rateFormData.absence_deduction_rate) || 0,
      rateFormData.pay_type as 'hourly' | 'daily',
      parseFloat(rateFormData.daily_rate) || 0
    )

    if (result.success) {
      setRateFormData({ hourly_rate: '', position_title: '', late_deduction_rate: '', absence_deduction_rate: '', pay_type: 'hourly', daily_rate: '' })
      setShowRateModal(false)
      loadInitialData()
    } else {
      setError(result.error || 'Failed to set hourly rate')
    }

    setIsLoading(false)
  }

      async function handleSaveSettings() {
      if (!storeId) return
      setIsSavingSettings(true)
      const res = await updateStorePayrollSettings(storeId, storeSettings)
      if (res.success) {
        alert('Settings saved successfully.')
      } else {
        alert('Failed to save settings: ' + res.error)
      }
      setIsSavingSettings(false)
    }

    async function handleCalculateHours() {
    if (!selectedEmployee || !generateFormData.period_start || !generateFormData.period_end) return

    setIsLoading(true)
    setError(null)

    const result = await calculateHoursWorked(
      selectedEmployee.id,
      new Date(generateFormData.period_start),
      new Date(generateFormData.period_end)
    )

    if (result.success) {
      setHoursWorked(result.hoursWorked)
    } else {
      setError(result.error || 'Failed to calculate hours')
    }

    setIsLoading(false)
  }

  
  async function handleDeletePayslip(payslipId: string) {
    if (!confirm('Are you sure you want to delete this payslip?')) return;
    setIsLoading(true);
    const result = await deletePayslip(payslipId);
    if (result.success) {
      loadInitialData();
    } else {
      setError(result.error || 'Failed to delete payslip');
      setIsLoading(false);
    }
  }

  async function handleGeneratePayslip(e: React.FormEvent) {
    e.preventDefault()
    
    if (!selectedEmployee || !selectedEmployee.store_id) {
      setError('Employee must be assigned to a store')
      return
    }

    setIsLoading(true)
    setError(null)

    const result = await generatePayslip(
      selectedEmployee.id,
      selectedEmployee.store_id,
      new Date(generateFormData.period_start),
      new Date(generateFormData.period_end)
    )

    if (result.success) {
      setGenerateFormData({ period_start: '', period_end: '' })
      setHoursWorked(0)
      setShowGenerateModal(false)
      loadInitialData()
    } else {
      setError(result.error || 'Failed to generate payslip')
    }

    setIsLoading(false)
  }

  function openRateModal(employee: Employee) {
    const existingRate = salaryRates[employee.id]
    setSelectedEmployee(employee)
    setRateFormData({
      hourly_rate: existingRate ? existingRate.hourly_rate.toString() : '',
      position_title: existingRate?.position_title || '',
      late_deduction_rate: (existingRate as any)?.late_deduction_rate?.toString() || '',
      absence_deduction_rate: (existingRate as any)?.absence_deduction_rate?.toString() || '',
      pay_type: (existingRate as any)?.pay_type || 'hourly',
      daily_rate: (existingRate as any)?.daily_rate?.toString() || '',
    })
    setHoursWorked(0)
    setShowRateModal(true)
  }

  function openGenerateModal(employee: Employee) {
    setSelectedEmployee(employee)
    setGenerateFormData({
      period_start: new Date().toISOString().split('T')[0],
      period_end: new Date().toISOString().split('T')[0],
    })
    setHoursWorked(0)
    setShowGenerateModal(true)
  }

  function displayEmployeeName(employee: Employee) {
    return employee.username || employee.full_name || `User ${employee.id.slice(0, 8)}`
  }

  function displayPayslipUserName(payslip: Payslip) {
    return payslip.user?.username || payslip.user?.full_name || 'Unknown'
  }

  async function handleToggleDailyHours() {
    if (!selectedPayslip) return

    if (showDailyHours) {
      setShowDailyHours(false)
      return
    }

    setDailyHoursLoading(true)
    setError(null)
    const result = await getDailyHoursBreakdown(
      selectedPayslip.user_id,
      new Date(selectedPayslip.period_start),
      new Date(selectedPayslip.period_end)
    )

    if (result.success) {
      setDailyHoursRows(result.days)
      setShowDailyHours(true)
    } else {
      setError(result.error || 'Failed to load daily hours')
    }
    setDailyHoursLoading(false)
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
              <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">Payroll</h1>
            <p className="text-gray-600 mt-1">Set hourly rates and generate payslips.</p>
          </div>
          {userRole === 'admin' && stores.length > 0 && (
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowImporter(true)}
                className="px-4 py-2 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">usb</span>
                Import Biometrics
              </button>
              <div className="h-6 w-px bg-gray-200"></div>
              <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700">Store:</span>
              <select
                value={storeId}
                onChange={(e) => {
                  const newStoreId = e.target.value
                  setStoreId(newStoreId)
                  loadStoreData(newStoreId, userRole)
                }}
                className="px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            </div>
          )}
        </div>

              {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

                {/* Global Payroll Settings */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b flex justify-between items-center">
            <h2 className="text-lg font-bold">Store Payroll Policies</h2>
            <button
              onClick={handleSaveSettings}
              disabled={isSavingSettings}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              {isSavingSettings ? 'Saving...' : 'Save Policies'}
            </button>
          </div>
                    <div className="p-6 grid grid-cols-1 gap-6 max-w-3xl">
            {/* Grace Period */}
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
              <label className="block text-sm font-semibold text-gray-800 mb-1">Grace Period</label>
              <p className="text-xs text-gray-500 mb-3">Lates within this period will not incur any penalties.</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={storeSettings.grace_period_mins}
                  onChange={(e) => setStoreSettings({ ...storeSettings, grace_period_mins: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 flex items-center select-none w-32 justify-center">Minutes</div>
              </div>
            </div>

            
            {/* Standard Late Penalty */}
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
              <label className="block text-sm font-semibold text-gray-800 mb-1">Standard Late Deduction</label>
              <p className="text-xs text-gray-500 mb-3">Amount to deduct per instance of a standard late (exceeds grace period but below half-day threshold).</p>
              <div className="flex gap-2">
                <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 flex items-center select-none justify-center">₱</div>
                <input
                  type="number"
                  value={storeSettings.standard_late_deduction}
                  onChange={(e) => setStoreSettings({ ...storeSettings, standard_late_deduction: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Half-Day Penalty */}
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
              <label className="block text-sm font-semibold text-gray-800 mb-1">Half-Day Penalty Policy</label>
              <p className="text-xs text-gray-500 mb-4">When a staff's late exceeds the threshold, this percentage of their daily rate will be deducted.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Threshold</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={halfDayUnit === 'hours' ? storeSettings.half_day_late_threshold_mins / 60 : storeSettings.half_day_late_threshold_mins}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setStoreSettings({ ...storeSettings, half_day_late_threshold_mins: halfDayUnit === 'hours' ? Math.round(val * 60) : val })
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={halfDayUnit}
                      onChange={(e) => setHalfDayUnit(e.target.value)}
                      className="px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Deduction %</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      max="100"
                      value={storeSettings.half_day_penalty_deduction_percentage}
                      onChange={(e) => setStoreSettings({ ...storeSettings, half_day_penalty_deduction_percentage: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 flex items-center select-none w-16 justify-center">%</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Full-Day Penalty */}
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
              <label className="block text-sm font-semibold text-gray-800 mb-1">Full-Day Penalty Policy</label>
              <p className="text-xs text-gray-500 mb-4">When a staff's late exceeds the threshold, this percentage of their daily rate will be deducted.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Threshold</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={fullDayUnit === 'hours' ? storeSettings.full_day_late_threshold_mins / 60 : storeSettings.full_day_late_threshold_mins}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setStoreSettings({ ...storeSettings, full_day_late_threshold_mins: fullDayUnit === 'hours' ? Math.round(val * 60) : val })
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={fullDayUnit}
                      onChange={(e) => setFullDayUnit(e.target.value)}
                      className="px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Deduction %</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      max="100"
                      value={storeSettings.full_day_penalty_deduction_percentage}
                      onChange={(e) => setStoreSettings({ ...storeSettings, full_day_penalty_deduction_percentage: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 flex items-center select-none w-16 justify-center">%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Employees with Rates */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-lg font-bold">Employee Salary Rates</h2>
        </div>
        {/* Mobile view */}
          <div className="md:hidden divide-y divide-gray-100">
            {employees.map((employee) => {
              const rate = salaryRates[employee.id]
              return (
                <div key={employee.id} className="p-4 flex flex-col gap-3 active:bg-gray-50 cursor-pointer" onClick={() => openRateModal(employee)}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-gray-900">{displayEmployeeName(employee)}</div>
                      <div className="text-sm text-gray-500">{rate?.position_title || 'No position'}</div>
                    </div>
                    <div className="text-right">
                      {rate ? (
                        <div className="font-medium text-gray-900">
                          {rate.pay_type === 'hourly' 
                              ? <>{'\u20B1'}{rate.hourly_rate.toFixed(2)}/hr</>
                            : <>{'\u20B1'}{rate.daily_rate?.toFixed(2)}/day</>}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 italic">Not set</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); openRateModal(employee); }}
                      className="flex-1 py-2 bg-blue-50 text-blue-700 font-medium rounded-lg text-sm"
                    >
                      {rate ? 'Edit Rate' : 'Set Rate'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openGenerateModal(employee); }}
                      className="flex-1 py-2 bg-green-50 text-green-700 font-medium rounded-lg text-sm disabled:opacity-50"
                      disabled={!rate}
                    >
                      Generate Payslip
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {/* Desktop view */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
            <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Position</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Salary Rate</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {employees.map((employee) => {
              const rate = salaryRates[employee.id]
              return (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">
                      {displayEmployeeName(employee)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-900">
                    {rate?.position_title || '-'}
                  </td>
                  <td className="px-6 py-4">
                    {rate ? (
                      <span className="font-medium text-gray-900">
                        {rate.pay_type === 'daily' 
                          ? <>{'\u20B1'}{(rate.daily_rate || 0).toFixed(2)}/day</>
                          : <>{'\u20B1'}{rate.hourly_rate.toFixed(2)}/hr</>}
                      </span>
                    ) : (
                      <span className="text-gray-500 italic">Not set</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => openRateModal(employee)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      {rate ? 'Edit Rate' : 'Set Rate'}
                    </button>
                    <button
                      onClick={() => openGenerateModal(employee)}
                      className="text-green-600 hover:text-green-900"
                      disabled={!rate}
                    >
                      Generate Payslip
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
          </div>
        </div>
        {/* Payslips */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-lg font-bold">Payslips</h2>
        </div>
        {isLoading && payslips.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : payslips.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No payslips yet</div>
        ) : (
          <>
          {/* Mobile view */}
          <div className="md:hidden divide-y divide-gray-100">
            {payslips.map((payslip) => (
              <div 
                key={payslip.id} 
                className="p-4 flex flex-col gap-2 active:bg-gray-50 cursor-pointer"
                onClick={() => {
                  setSelectedPayslip(payslip)
                  setShowDailyHours(false)
                  setDailyHoursRows([])
                  setShowPayslipModal(true)
                }}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-gray-900">{displayPayslipUserName(payslip)}</div>
                    <div className="text-xs text-gray-500">{payslip.store?.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-700">{'\u20B1'}{Number(payslip.net_pay).toFixed(2)}</div>
                    <div className="text-xs text-gray-500">Net Pay</div>
                  </div>
                </div>
                <div className="flex justify-between text-sm text-gray-600 bg-gray-50 p-2 rounded">
                  <div>
                    {new Date(payslip.period_start).toLocaleDateString()} - {new Date(payslip.period_end).toLocaleDateString()}
                  </div>
                  <div>
                    {Number(payslip.hours_worked).toFixed(2)} hrs
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop view */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gross Pay</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Net Pay</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {payslips.map((payslip) => (
                <tr key={payslip.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{displayPayslipUserName(payslip)}</div>
                    <div className="text-xs text-gray-500">{payslip.store?.name}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-900">
                    {new Date(payslip.period_start).toLocaleDateString()} - {new Date(payslip.period_end).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-gray-900">{payslip.hours_worked.toFixed(2)} hrs</td>
                  <td className="px-6 py-4 font-medium">
                    {'\u20B1'}{payslip.gross_pay.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 font-medium">
                    {'\u20B1'}{payslip.net_pay.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => {
                        setSelectedPayslip(payslip)
                        setShowDailyHours(false)
                        setDailyHoursRows([])
                        setShowPayslipModal(true)
                      }}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </>
        )}
      </div>

      {/* Set Rate Modal */}
      {showRateModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 text-base">
                          <div className="p-7 border-b">
                <h2 className="text-2xl font-bold">Set Salary Rate</h2>
                <p className="text-gray-600">{displayEmployeeName(selectedEmployee)}</p>
              </div>
              <form onSubmit={handleSetRate} className="p-7 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-base font-medium text-gray-700 mb-1">Pay Type</label>
                    <select
                      value={rateFormData.pay_type}
                      onChange={(e) => setRateFormData({ ...rateFormData, pay_type: e.target.value as 'hourly' | 'daily' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-base font-medium text-gray-700 mb-1">
                      {rateFormData.pay_type === 'hourly' ? 'Hourly Rate *' : 'Daily Rate *'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                        ?
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={rateFormData.pay_type === 'hourly' ? rateFormData.hourly_rate : rateFormData.daily_rate}
                        onChange={(e) => {
                          if (rateFormData.pay_type === 'hourly') {
                            setRateFormData({ ...rateFormData, hourly_rate: e.target.value })
                          } else {
                            setRateFormData({ ...rateFormData, daily_rate: e.target.value })
                          }
                        }}
                        className="w-full pl-8 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                        /{rateFormData.pay_type === 'hourly' ? 'hr' : 'day'}
                      </span>
                    </div>
                  </div>
                </div>
                              <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">Position Title</label>
                  <input
                    type="text"
                    value={rateFormData.position_title}
                    onChange={(e) => setRateFormData({ ...rateFormData, position_title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Barista, Cashier"
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">Late Deduction ({'\u20B1'})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={rateFormData.late_deduction_rate}
                    onChange={(e) => setRateFormData({ ...rateFormData, late_deduction_rate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Penalty per late"
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">Absence Deduction ({'\u20B1'})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={rateFormData.absence_deduction_rate}
                    onChange={(e) => setRateFormData({ ...rateFormData, absence_deduction_rate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Penalty per absence"
                  />
                </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={isLoading}
                >
                  {isLoading ? 'Saving...' : 'Save Rate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generate Payslip Modal */}
      {showGenerateModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 text-base">
            <div className="p-7 border-b">
              <h2 className="text-2xl font-bold">Generate Payslip</h2>
              <p className="text-gray-600">{displayEmployeeName(selectedEmployee)}</p>
            </div>
                          <form onSubmit={handleGeneratePayslip} className="p-7 space-y-5">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date()
                      const y = now.getFullYear()
                      const m = String(now.getMonth() + 1).padStart(2, '0')
                      setGenerateFormData({
                        period_start: `${y}-${m}-01`,
                        period_end: `${y}-${m}-15`
                      })
                    }}
                    className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100"
                  >
                    1st - 15th
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date()
                      const y = now.getFullYear()
                      const m = String(now.getMonth() + 1).padStart(2, '0')
                      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate()
                      setGenerateFormData({
                        period_start: `${y}-${m}-16`,
                        period_end: `${y}-${m}-${lastDay}`
                      })
                    }}
                    className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100"
                  >
                    16th - End
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">Period Start *</label>
                  <input
                    type="date"
                    required
                    value={generateFormData.period_start}
                    onChange={(e) => setGenerateFormData({ ...generateFormData, period_start: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">Period End *</label>
                  <input
                    type="date"
                    required
                    value={generateFormData.period_end}
                    onChange={(e) => setGenerateFormData({ ...generateFormData, period_end: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <button
                  type="button"
                  onClick={handleCalculateHours}
                  className="w-full text-blue-600 hover:text-blue-900 text-base mb-2"
                  disabled={isLoading}
                >
                  Calculate Hours Worked
                </button>
                {hoursWorked > 0 && (
                  <div className="text-center">
                    <span className="text-base text-gray-600">Hours worked: </span>
                    <span className="text-2xl font-bold text-gray-900">{hoursWorked.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  disabled={isLoading}
                >
                  {isLoading ? 'Generating...' : 'Generate Payslip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Payslip Modal */}
      {showPayslipModal && selectedPayslip && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col text-base">
            <div className="p-7 border-b flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Payslip Details</h2>
                <p className="text-gray-600">{displayPayslipUserName(selectedPayslip)}</p>
              </div>
              <button
                onClick={() => {
                  setShowPayslipModal(false)
                  setSelectedPayslip(null)
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                {'\u00D7'}
              </button>
            </div>
            <div className="p-7 space-y-5 overflow-y-auto">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <p className="text-sm font-semibold uppercase tracking-wide text-green-700">Total Payroll</p>
                    <p className="mt-1 text-2xl font-bold text-green-800">
                      {'\u20B1'}{Number(selectedPayslip.net_pay).toFixed(2)}
                    </p>
                    <p className="text-sm text-green-700 mt-1">Net pay for selected period</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm font-semibold uppercase tracking-wide text-gray-700">Period Summary</p>
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Period:</span>
                        <span className="font-medium">
                          {new Date(selectedPayslip.period_start).toLocaleDateString()} - {new Date(selectedPayslip.period_end).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Hours Worked:</span>
                        <span className="font-medium">{Number(selectedPayslip.hours_worked).toFixed(2)} hrs</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Lates:</span>
                        <span className="font-medium text-amber-600">{selectedPayslip.lates_count ?? 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Absences:</span>
                        <span className="font-medium text-red-600">{selectedPayslip.absences_count ?? 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Deductions:</span>
                        <span className="font-medium text-red-600">-{'\u20B1'}{Number(selectedPayslip.deductions ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm border-t border-gray-200 pt-1 mt-1">
                        <span className="text-gray-600">Gross Pay:</span>
                        <span className="font-medium">{'\u20B1'}{Number(selectedPayslip.gross_pay).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

              <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Period Start</p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {new Date(selectedPayslip.period_start).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Period End</p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {new Date(selectedPayslip.period_end).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <button
                  type="button"
                  onClick={handleToggleDailyHours}
                  className="text-base text-blue-600 hover:text-blue-900 font-medium"
                  disabled={dailyHoursLoading}
                >
                  {dailyHoursLoading
                    ? 'Loading daily hours...'
                    : showDailyHours
                      ? 'Hide daily hours'
                      : 'Show daily hours'}
                </button>

                {showDailyHours && (
                  <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                    {dailyHoursRows.length === 0 ? (
                      <div className="p-3 text-base text-gray-500">No clocked hours in this period.</div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto">
                        <table className="w-full text-base">
                          <thead className="bg-gray-50 border-b sticky top-0 z-10">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-600">Hours</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {dailyHoursRows.map((row, idx) => (
                              <tr key={row.date} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                                <td className="px-3 py-2 text-gray-800">
                                  {new Date(row.date).toLocaleDateString()}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-900 font-semibold">
                                  {row.hours.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="text-center text-base text-gray-500">
                Generated on {new Date(selectedPayslip.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    
      {/* Importer Modal */}
      {showImporter && storeId && (
        <BiometricImporter 
          storeId={storeId}
          storeName={stores.find(s => s.id === storeId)?.name}
          users={employees}
          onCancel={() => setShowImporter(false)}
          onSuccess={() => {
            setShowImporter(false);
            loadInitialData(); // reload data if needed
          }}
        />
      )}
    </div>
  )
}
