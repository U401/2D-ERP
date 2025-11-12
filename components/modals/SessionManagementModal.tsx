'use client'

import { useState } from 'react'
import { format } from 'date-fns'

type Session = {
  id: string
  opened_at: string
  closed_at: string | null
  status: 'open' | 'closed'
}

type Props = {
  session: Session | null
  onClose: () => void
  onOpenSession: () => Promise<{ success: boolean; error: string | null }>
  onCloseSession: (
    sessionId: string
  ) => Promise<{ success: boolean; error: string | null }>
}

export default function SessionManagementModal({
  session,
  onClose,
  onOpenSession,
  onCloseSession,
}: Props) {
  const [isProcessing, setIsProcessing] = useState(false)

  async function handleOpenSession() {
    setIsProcessing(true)
    try {
      const result = await onOpenSession()
      if (result.success) {
        onClose()
      } else {
        alert(`Error: ${result.error}`)
      }
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleCloseSession() {
    if (!session) return
    setIsProcessing(true)
    try {
      const result = await onCloseSession(session.id)
      if (result.success) {
        onClose()
      } else {
        alert(`Error: ${result.error}`)
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const isOpen = session?.status === 'open'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative flex w-full max-w-sm flex-col rounded-xl bg-white dark:bg-[#1C1C1C] p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <h2 className="text-2xl font-bold text-[#111111] dark:text-white">
            Session Management
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="mt-6 flex flex-col items-center text-center">
          <div className="flex items-center gap-3">
            {isOpen ? (
              <>
                <div className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </div>
                <p className="text-lg font-medium text-[#111111] dark:text-white">
                  Session Open
                </p>
              </>
            ) : (
              <>
                <div className="size-3 rounded-full bg-gray-400"></div>
                <p className="text-lg font-medium text-[#111111] dark:text-white">
                  Session Closed
                </p>
              </>
            )}
          </div>
          <p className="mt-2 text-sm text-[#666666] dark:text-gray-400">
            {isOpen && session
              ? `Opened: ${format(new Date(session.opened_at), 'MMM d, h:mm a')}`
              : session?.closed_at
              ? `Last closed: ${format(new Date(session.closed_at), 'MMM d, h:mm a')}`
              : 'No active session'}
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-4">
          {isOpen ? (
            <button
              onClick={handleCloseSession}
              disabled={isProcessing}
              className="flex h-12 w-full cursor-pointer items-center justify-center rounded-lg bg-[#111111] dark:bg-white text-base font-bold text-white dark:text-black hover:bg-[#333333] dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? 'Closing...' : 'Close Session'}
            </button>
          ) : (
            <button
              onClick={handleOpenSession}
              disabled={isProcessing}
              className="flex h-12 w-full cursor-pointer items-center justify-center rounded-lg bg-[#111111] dark:bg-white text-base font-bold text-white dark:text-black hover:bg-[#333333] dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? 'Opening...' : 'Open New Session'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

