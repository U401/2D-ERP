'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function openSession() {
  const supabase = createServerClient()
  
  const { data, error } = await supabase.rpc('open_session')

  if (error) {
    return { success: false, error: error.message, sessionId: null }
  }

  revalidatePath('/pos')
  return { success: true, error: null, sessionId: data }
}

export async function closeSession(sessionId: string) {
  const supabase = createServerClient()
  
  const { error } = await supabase.rpc('close_session', {
    p_session_id: sessionId,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/pos')
  return { success: true, error: null }
}

export async function getCurrentSession() {
  const supabase = createServerClient()
  
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('status', 'open')
    .single()

  if (error && error.code !== 'PGRST116') {
    return { success: false, error: error.message, session: null }
  }

  return { success: true, error: null, session: data }
}

