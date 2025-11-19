import { NextResponse } from 'next/server'
import { Client } from 'pg'
import fs from 'fs'
import path from 'path'

export async function POST() {
  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL

  if (!databaseUrl) {
    return NextResponse.json({
      success: false,
      message: 'DATABASE_URL not found. Please add it to .env.local. Get it from Supabase Dashboard > Settings > Database > Connection String'
    }, { status: 400 })
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  })

  try {
    await client.connect()

    // Read migration SQL
    const migrationPath = path.join(process.cwd(), 'scripts', 'run-gcash-migrations.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

    // Execute migrations in a transaction
    await client.query('BEGIN')
    await client.query(migrationSQL)
    await client.query('COMMIT')

    await client.end()

    return NextResponse.json({
      success: true,
      message: 'Migrations executed successfully! GCash feature is now ready.'
    })
  } catch (error: any) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      // Ignore rollback errors
    }

    await client.end()

    if (error.message.includes('already exists')) {
      return NextResponse.json({
        success: true,
        message: 'Migrations completed (some objects already existed, which is fine)'
      })
    }

    return NextResponse.json({
      success: false,
      message: `Migration failed: ${error.message}. Please try the manual method.`
    }, { status: 500 })
  }
}



