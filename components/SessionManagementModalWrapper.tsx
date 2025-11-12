'use client'

import { useEffect, useState } from 'react'
import SessionManagementModal from './modals/SessionManagementModal'
import { getCurrentSession, openSession, closeSession } from '@/app/actions/session'

export default function SessionManagementModalWrapper() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSession()
  }, [])

  async function loadSession() {
    const result = await getCurrentSession()
    if (result.success && result.session) {
      setSession(result.session)
    }
    setLoading(false)
  }

  if (loading) {
    return <div className="text-white">Loading...</div>
  }

  return (
    <SessionManagementModal
      session={session}
      onClose={() => {}}
      onOpenSession={async () => {
        const result = await openSession()
        if (result.success) {
          await loadSession()
        }
        return result
      }}
      onCloseSession={async (sessionId: string) => {
        const result = await closeSession(sessionId)
        if (result.success) {
          await loadSession()
        }
        return result
      }}
    />
  )
}

