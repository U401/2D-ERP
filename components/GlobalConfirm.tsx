'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Shared event bus ───────────────────────────────────────────────────────
type ConfirmPayload = { message: string; resolve: (value: boolean) => void }
let _dispatchConfirm: ((payload: ConfirmPayload) => void) | null = null

/**
 * showConfirm(message) → Promise<boolean>
 *
 * Drop-in async replacement for window.confirm().
 * Works on Android WebView (Tauri), where the native dialog is silently blocked.
 *
 * Usage:
 *   if (!(await showConfirm('Delete this item?'))) return
 */
export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (_dispatchConfirm) {
      _dispatchConfirm({ message, resolve })
    } else {
      // Fallback if component not mounted yet
      resolve(true)
    }
  })
}

// ─── UI Component ──────────────────────────────────────────────────────────
export function GlobalConfirm() {
  const [state, setState] = useState<{ visible: boolean; message: string; resolve: ((v: boolean) => void) | null }>({
    visible: false,
    message: '',
    resolve: null,
  })

  const dispatch = useCallback((payload: ConfirmPayload) => {
    setState({ visible: true, message: payload.message, resolve: payload.resolve })
  }, [])

  useEffect(() => {
    _dispatchConfirm = dispatch
    return () => { _dispatchConfirm = null }
  }, [dispatch])

  const handle = (value: boolean) => {
    state.resolve?.(value)
    setState({ visible: false, message: '', resolve: null })
  }

  if (!state.visible) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 max-w-md w-full animate-in zoom-in-95 duration-200 flex flex-col gap-6">
        <div className="flex gap-4 items-start">
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-3xl">warning</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-black text-gray-900 mb-2">Are you sure?</h3>
            <p className="text-gray-600 font-medium whitespace-pre-wrap text-sm sm:text-base">{state.message}</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => handle(false)}
            className="px-5 py-2.5 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => handle(true)}
            className="px-5 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 transition-all shadow-lg shadow-red-600/20"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
