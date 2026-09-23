'use client'

import { useState, useEffect } from 'react'
import { toggleClock } from '@/app/actions/hr'
import { authenticateFingerprint } from '@/app/actions/webauthn'
import { createClient } from '@/lib/supabase/client'

export default function TimeClockPage() {
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState<Date | null>(null)

  useEffect(() => {
    async function loadStore() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('store_id').eq('id', user.id).single()
        if (profile) setStoreId(profile.store_id)
      }
    }
    loadStore()
    setCurrentTime(new Date())
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  async function handleToggleClock(e: React.FormEvent) {
    e.preventDefault()
    if (loading || successMessage) return
    
    setLoading(true)
    setError(null)

    if (pin.length !== 4) {
      setError('PIN must be 4 digits')
      setLoading(false)
      return
    }

    const result = await toggleClock(pin)

    if (result.success) {
      const actionText = result.action === 'clock_in' ? 'clocked in' : 'clocked out'
      setSuccessMessage(`Success! ${result.username} has ${actionText}.`)
      setPin('')
      setTimeout(() => {
        setSuccessMessage(null)
      }, 3000)
    } else {
      setError(result.error || 'Failed to process request')
    }

    setLoading(false)
  }

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num)
    }
  }

  async function handleFingerprint() {
    if (loading || successMessage || !storeId) return
    setLoading(true)
    setError(null)
    const result = await authenticateFingerprint(storeId)
    if (result.success) {
      const actionText = result.action === 'clock_in' ? 'clocked in' : 'clocked out'
      setSuccessMessage(`Success! ${result.username} has ${actionText} (Biometric).`)
      setTimeout(() => setSuccessMessage(null), 3000)
    } else {
      setError(result.error || 'Fingerprint verification failed')
    }
    setLoading(false)
  }

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1))
  }

  if (!currentTime) return null // Prevent hydration mismatch

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 overflow-y-auto">
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        
        <div className="mb-10 text-center">
          <h1 className="text-5xl sm:text-7xl font-black text-slate-900 tracking-tight">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </h1>
          <p className="text-lg sm:text-xl font-medium text-slate-500 mt-2 uppercase tracking-widest">
            {currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-xl max-w-md w-full p-8 border border-slate-100">
          {successMessage ? (
            <div className="flex flex-col items-center justify-center py-12 animate-in fade-in slide-in-from-bottom-4">
              <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-5xl text-emerald-600">check_circle</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 text-center">{successMessage}</p>
              <p className="text-slate-500 mt-2 font-medium">Have a great shift!</p>
            </div>
          ) : (
            <div className="animate-in fade-in">
              <h2 className="text-2xl font-bold text-slate-900 text-center mb-6">Time Clock</h2>
              
              <div className="mb-8">
                <div className="flex justify-center gap-4 mb-6">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                        i < pin.length
                          ? 'bg-slate-900 border-slate-900 scale-125'
                          : 'bg-transparent border-slate-200'
                      }`}
                    />
                  ))}
                </div>
                <div className="h-6 flex items-center justify-center">
                  {error && (
                    <p className="text-red-500 text-sm font-bold animate-shake">
                      {error}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    onClick={() => handleNumberClick(num.toString())}
                    className="h-20 sm:h-24 rounded-3xl bg-slate-50 text-3xl sm:text-4xl font-bold text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={handleFingerprint}
                  disabled={loading || !storeId}
                  className="h-20 sm:h-24 rounded-3xl bg-purple-50 text-purple-600 flex items-center justify-center hover:bg-purple-100 active:bg-purple-200 transition-colors disabled:opacity-50"
                  title="Use Fingerprint"
                >
                  <span className="material-symbols-outlined text-4xl sm:text-5xl">fingerprint</span>
                </button>
                <button
                  onClick={() => handleNumberClick('0')}
                  className="h-20 sm:h-24 rounded-3xl bg-slate-50 text-3xl sm:text-4xl font-bold text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                >
                  0
                </button>
                <button
                  onClick={handleDelete}
                  className="h-20 sm:h-24 rounded-3xl bg-slate-50 flex items-center justify-center hover:bg-slate-100 active:bg-slate-200 transition-colors"
                >
                  <span className="material-symbols-outlined text-slate-600">backspace</span>
                </button>
                <button
                  onClick={(e) => handleToggleClock(e as any)}
                  disabled={pin.length !== 4 || loading}
                  className="h-20 sm:h-24 rounded-3xl bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 active:bg-emerald-800 transition-colors disabled:opacity-50 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {loading ? (
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span className="material-symbols-outlined text-3xl">login</span>
                  )}
                </button>
              </div>

              <p className="text-center text-slate-400 text-sm font-medium">
                Enter your unique PIN to clock in or out
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
