'use client'

import { useEffect, useState } from 'react'

export function GlobalAlert() {
  const [alerts, setAlerts] = useState<{id: number, msg: string}[]>([])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.alert = (msg: any) => {
        setAlerts(prev => [...prev, { id: Date.now(), msg: String(msg) }])
      }
    }
  }, [])

  useEffect(() => {
    if (alerts.length > 0) {
      const timer = setTimeout(() => {
        setAlerts(prev => prev.slice(1))
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [alerts])

  if (alerts.length === 0) return null

  const handleClose = (id: number) => {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-end sm:justify-start p-4 sm:p-6 sm:pt-24 pointer-events-none gap-3">
      {alerts.map((alert) => (
        <div key={alert.id} className="pointer-events-auto bg-gray-900 text-white rounded-2xl shadow-2xl p-4 sm:p-5 w-full max-w-sm sm:max-w-md animate-in fade-in slide-in-from-bottom-5 sm:slide-in-from-top-5 duration-300 flex items-start gap-4">
          <span className="material-symbols-outlined text-amber-400 mt-0.5">info</span>
          <div className="flex-1">
            <h4 className="font-bold text-base mb-1">Notification</h4>
            <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{alert.msg}</p>
          </div>
          <button onClick={() => handleClose(alert.id)} className="p-1 hover:bg-gray-800 rounded-lg transition-colors shrink-0">
            <span className="material-symbols-outlined text-gray-400 hover:text-white text-xl">close</span>
          </button>
        </div>
      ))}
    </div>
  )
}
