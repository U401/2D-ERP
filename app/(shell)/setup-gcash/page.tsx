'use client'

import { useState } from 'react'
import { createGCashTransactionsBucket } from '@/app/actions/storage'
import { createClient } from '@/lib/supabase/client'

export default function SetupGCashPage() {
  const [bucketStatus, setBucketStatus] = useState<string | null>(null)
  const [bucketLoading, setBucketLoading] = useState(false)
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null)

  async function handleCreateBucket() {
    setBucketLoading(true)
    setBucketStatus(null)

    try {
      const result = await createGCashTransactionsBucket()
      if (result.success) {
        setBucketStatus(`Success: ${result.message}`)
      } else {
        setBucketStatus(`Error: ${result.error}`)
      }
    } catch (error) {
      setBucketStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setBucketLoading(false)
    }
  }

  async function checkMigrations() {
    try {
      const supabase = createClient()
      
      // Check if GCash columns exist
      const { data, error } = await supabase
        .from('sales')
        .select('gcash_reference_code')
        .limit(1)

      if (error) {
        // Check if it's a column doesn't exist error
        if (error.message.includes('column') && error.message.includes('does not exist')) {
          setMigrationStatus('Migrations not applied. Please run the SQL migrations in Supabase SQL Editor.')
        } else {
          setMigrationStatus(`Error checking migrations: ${error.message}`)
        }
      } else {
        setMigrationStatus('✓ Migrations appear to be applied successfully!')
      }
    } catch (error) {
      setMigrationStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return (
    <div className="flex-1 p-8">
      <div className="w-full max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-black dark:text-white mb-4">
          GCash Transaction Detection Setup
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Complete the setup for GCash transaction image detection feature.
        </p>

        <div className="bg-white dark:bg-black rounded-lg border border-gray-200 dark:border-gray-800 p-6 space-y-6">
          {/* Step 1: Database Migrations */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Step 1: Database Migrations
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Run these SQL migrations in your Supabase SQL Editor:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li>
                <code className="bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded">
                  supabase/migrations/0009_add_gcash_transaction.sql
                </code>
              </li>
              <li>
                <code className="bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded">
                  supabase/migrations/0010_update_finalize_sale_gcash.sql
                </code>
              </li>
              <li>
                <code className="bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded">
                  supabase/migrations/0011_gcash_storage_bucket.sql
                </code>
              </li>
            </ol>
            <div className="flex gap-3">
              <button
                onClick={checkMigrations}
                className="px-4 py-2 bg-button-gray text-gray-900 rounded-lg hover:bg-[#D0D0D0] transition-colors text-sm font-medium border border-gray-200"
              >
                Check Migrations Status
              </button>
            </div>
            {migrationStatus && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  migrationStatus.includes('✓')
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
                    : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800'
                }`}
              >
                {migrationStatus}
              </div>
            )}
          </div>

          {/* Step 2: Storage Bucket */}
          <div className="space-y-4 pt-6 border-t border-gray-200 dark:border-gray-800">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Step 2: Storage Bucket
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Create the private storage bucket for GCash transaction images.
            </p>
            <button
              onClick={handleCreateBucket}
              disabled={bucketLoading}
              className="px-4 py-2 bg-button-gray text-gray-900 rounded-lg hover:bg-[#D0D0D0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium border border-gray-200"
            >
              {bucketLoading ? 'Creating...' : 'Create GCash Transactions Bucket'}
            </button>
            {bucketStatus && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  bucketStatus.includes('Success')
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
                }`}
              >
                {bucketStatus}
              </div>
            )}
          </div>

          {/* Step 3: Google Cloud Vision API */}
          <div className="space-y-4 pt-6 border-t border-gray-200 dark:border-gray-800">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Step 3: Google Cloud Vision API
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Make sure you have configured the Google Cloud Vision API key in your{' '}
              <code className="bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded">.env.local</code>{' '}
              file:
            </p>
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
              <code className="text-sm text-gray-800 dark:text-gray-200">
                GOOGLE_CLOUD_API_KEY=your_api_key_here
              </code>
            </div>
          </div>

          {/* Instructions */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h3 className="font-semibold mb-2 text-blue-800 dark:text-blue-200">
              Quick Setup Instructions:
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-700 dark:text-blue-300">
              <li>Run the three SQL migrations in Supabase SQL Editor (Step 1)</li>
              <li>Click "Create GCash Transactions Bucket" button above (Step 2)</li>
              <li>Verify Google Cloud Vision API key is configured (Step 3)</li>
              <li>Test the feature by going to POS page and selecting GCash payment</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}



