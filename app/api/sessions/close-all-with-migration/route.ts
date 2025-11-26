import { NextResponse } from 'next/server'
import { Client } from 'pg'
import fs from 'fs'
import path from 'path'
import { createServerClient } from '@/lib/supabase/server'

export async function POST() {
  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL

  // If DATABASE_URL is available, we can run the migration directly
  if (databaseUrl) {
    const client = new Client({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false
      }
    })

    try {
      await client.connect()

      // Read migration SQL
      const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '0012_close_all_sessions.sql')
      
      if (!fs.existsSync(migrationPath)) {
        await client.end()
        return NextResponse.json({
          success: false,
          message: 'Migration file not found'
        }, { status: 404 })
      }

      const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

      // Execute migration in a transaction
      await client.query('BEGIN')
      await client.query(migrationSQL)
      await client.query('COMMIT')

      await client.end()

      // Now close all sessions
      const supabase = createServerClient()
      const { data, error } = await supabase.rpc('close_all_sessions')

      if (error) {
        return NextResponse.json({
          success: false,
          message: `Migration succeeded but failed to close sessions: ${error.message}`,
          error: error.message
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: `Migration executed and closed ${data || 0} session(s)`,
        closedCount: data || 0
      })
    } catch (error: any) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        // Ignore rollback errors
      }

      await client.end()

      if (error.message.includes('already exists')) {
        // Function already exists, just try to close sessions
        const supabase = createServerClient()
        const { data, error: rpcError } = await supabase.rpc('close_all_sessions')

        if (rpcError) {
          return NextResponse.json({
            success: false,
            message: `Function exists but failed to close sessions: ${rpcError.message}`,
            error: rpcError.message
          }, { status: 500 })
        }

        return NextResponse.json({
          success: true,
          message: `Closed ${data || 0} session(s)`,
          closedCount: data || 0
        })
      }

      return NextResponse.json({
        success: false,
        message: `Error: ${error.message}`,
        error: error.message
      }, { status: 500 })
    }
  } else {
    // No DATABASE_URL, use Supabase client approach
    const supabase = createServerClient()
    
    // Try to call the function (will fail if migration not run)
    const { data, error } = await supabase.rpc('close_all_sessions')

    if (error) {
      // Migration not run yet
      const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '0012_close_all_sessions.sql')
      let migrationSQL = ''
      
      if (fs.existsSync(migrationPath)) {
        migrationSQL = fs.readFileSync(migrationPath, 'utf8')
      }

      return NextResponse.json({
        success: false,
        needsMigration: true,
        message: 'Migration needed. Please run the SQL in Supabase Dashboard > SQL Editor, or set DATABASE_URL in .env.local',
        sql: migrationSQL
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: `Closed ${data || 0} session(s)`,
      closedCount: data || 0
    })
  }
}


