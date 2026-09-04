'use client'

import { useState, useEffect } from 'react'
import { toggleClock } from '@/app/actions/hr'

type ClockInOutModalProps = {
  isOpen: boolean
  onClose: () => void
  onClockChange?: () => void
}

export default function ClockInOutModal({
  isOpen,
  onClose,
  onClockChange,
}: ClockInOutModalProps) {
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setPin('')
      setError(null)
      setSuccessMessage(null)
    }
  }, [isOpen])

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
      onClockChange?.()
      setTimeout(() => {
        onClose()
      }, 2000)
    } else {
      setError(result.error || 'Failed to process request')
    }

    setLoading(false)
  }

  if (!isOpen) return null

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num)
    }
  }

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1))
  }

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Time Clock</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <span className="material-symbols-outlined text-slate-500">close</span>
            </button>
          </div>

          {successMessage ? (
            <div className="flex flex-col items-center justify-center py-12 animate-in fade-in slide-in-from-bottom-4">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-4xl text-green-600">check_circle</span>
              </div>
              <p className="text-xl font-bold text-slate-900 text-center">{successMessage}</p>
              <p className="text-slate-500 mt-2">Closing in a moment...</p>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <div className="flex justify-center gap-3 mb-4">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                        i < pin.length
                          ? 'bg-slate-900 border-slate-900 scale-110'
                          : 'bg-transparent border-slate-200'
                      }`}
                    />
                  ))}
                </div>
                {error && (
                  <p className="text-red-500 text-center text-sm font-medium animate-shake">
                    {error}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4 mb-8">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    onClick={() => handleNumberClick(num.toString())}
                    className="h-16 rounded-2xl bg-slate-50 text-2xl font-bold text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={handleDelete}
                  className="h-16 rounded-2xl bg-slate-50 flex items-center justify-center hover:bg-slate-100 active:bg-slate-200 transition-colors"
                >
                  <span className="material-symbols-outlined text-slate-600">backspace</span>
                </button>
                <button
                  onClick={() => handleNumberClick('0')}
                  className="h-16 rounded-2xl bg-slate-50 text-2xl font-bold text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                >
                  0
                </button>
                <button
                  onClick={(e) => handleToggleClock(e as any)}
                  disabled={pin.length !== 4 || loading}
                  className="h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 active:bg-slate-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span className="material-symbols-outlined text-2xl">login</span>
                  )}
                </button>
              </div>

              <p className="text-center text-slate-400 text-sm">
                Enter your unique PIN to clock in or out
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
