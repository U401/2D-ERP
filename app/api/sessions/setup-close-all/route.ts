import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import fs from 'fs'
import path from 'path'

export async function POST() {
  try {
    const supabase = createServerClient()
    
    // Read the migration SQL file
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '0012_close_all_sessions.sql')
    
    if (!fs.existsSync(migrationPath)) {
      return NextResponse.json({
        success: false,
        message: 'Migration file not found'
      }, { status: 404 })
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')
    
    // Execute the migration using Supabase RPC (we'll use raw SQL execution)
    // Since Supabase client doesn't support raw SQL directly, we'll use the service role
    // to execute via RPC or we can use pg client
    
    // For now, let's try to call the function to see if it exists
    const { data, error } = await supabase.rpc('close_all_sessions')
    
    if (error) {
      // Function doesn't exist, need to run migration
      // We'll return instructions since we can't execute raw SQL directly through Supabase client
      return NextResponse.json({
        success: false,
        needsMigration: true,
        message: 'Migration needed. Please run the SQL in Supabase Dashboard > SQL Editor',
        sql: migrationSQL
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: true,
      message: 'Function already exists. You can now use /api/sessions/close-all to close all sessions.'
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      error: error.message
    }, { status: 500 })
  }
}


