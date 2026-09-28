'use client'

import Sidebar from '@/components/Sidebar'
import AdminDrawer from '@/components/sidebar/AdminDrawer'
import StaffDrawer from '@/components/sidebar/StaffDrawer'
import { AdminNotificationListener } from '@/components/AdminNotificationListener'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/utils/activity-log'
import { getInstanceId } from '@/lib/utils/instance-id'
import { useEffect, useState } from 'react'
import { showConfirm } from '@/components/GlobalConfirm'

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const supabase = createClient()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [username, setUsername] = useState('')
  const [storeName, setStoreName] = useState('')

  useEffect(() => {
    async function checkUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, role, store_id')
          .eq('id', user.id)
          .single()

        if (profile) {
          const userIsAdmin = profile.role === 'admin'
          setIsAdmin(userIsAdmin)
          setUsername(profile.username || '')

          if (!userIsAdmin && profile.store_id) {
            const { data: store } = await supabase
              .from('stores')
              .select('name')
              .eq('id', profile.store_id)
              .single()
            setStoreName(store?.name || '')
          }
        }
      }
    }
    checkUser()
  }, [supabase])

  async function handleLogout() {
    if (!(await showConfirm('Are you sure you want to log out?'))) return
    await logActivity('logout')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const instanceId = getInstanceId()
        await supabase
          .from('user_active_logins')
          .delete()
          .eq('user_id', user.id)
          .eq('instance_id', instanceId)

        await supabase.from('user_presence').upsert({
          user_id: user.id,
          status: 'offline',
          current_page: 'logout',
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }
    } catch {
      // ignore
    }
    await supabase.auth.signOut()
    router.push('/login/')
  }

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col bg-slate-50">
      <AdminNotificationListener />
      <div className="flex h-full w-full overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:flex h-full">
          <Sidebar />
        </div>

        {/* Dedicated Role-Separated Mobile Drawers */}
        {isAdmin ? (
          <AdminDrawer
            isOpen={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            username={username}
          />
        ) : (
          <StaffDrawer
            isOpen={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            username={username}
            storeName={storeName}
          />
        )}

        <main className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
          {/* Mobile header with safe area top padding */}
          <header className="md:hidden border-b border-gray-200 bg-white flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 shrink-0">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setMobileMenuOpen(true)}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors"
                title="Open Navigation"
              >
                <span className="material-symbols-outlined text-[22px]">menu</span>
              </button>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-[10px]">
                  ERP
                </div>
                <span className="text-base font-black text-slate-900 tracking-tight">Coffee Shop ERP</span>
              </div>
            </div>
            
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors border border-red-100"
              title="Logout"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
              <span>Logout</span>
            </button>
          </header>

          {/* Content scroll region */}
          <div className="flex-1 min-h-0 overflow-y-auto pb-6 relative flex flex-col">{children}</div>
        </main>
      </div>
    </div>
  )
}
