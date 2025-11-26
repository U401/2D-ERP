import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const results = {
    url: {
      exists: !!supabaseUrl,
      value: supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : null,
      valid: supabaseUrl ? supabaseUrl.includes('supabase.co') : false,
    },
    anonKey: {
      exists: !!supabaseAnonKey,
      value: supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : null,
      length: supabaseAnonKey?.length || 0,
    },
    serviceKey: {
      exists: !!supabaseServiceKey,
      value: supabaseServiceKey ? `${supabaseServiceKey.substring(0, 20)}...` : null,
      length: supabaseServiceKey?.length || 0,
    },
    connectionTest: null as any,
  }

  // Test connection if keys exist
  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      const { data, error } = await supabase.from('sessions').select('count').limit(1)

      results.connectionTest = {
        success: !error,
        error: error ? {
          message: error.message,
          code: error.code,
          details: error.details,
        } : null,
      }
    } catch (error: any) {
      results.connectionTest = {
        success: false,
        error: {
          message: error.message,
          type: error.constructor.name,
        },
      }
    }
  }

  return NextResponse.json(results, {
    status: results.url.exists && results.anonKey.exists ? 200 : 400,
  })
}


