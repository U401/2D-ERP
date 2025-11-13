'use client'

import { useState } from 'react'
import { createProductImagesBucket } from '@/app/actions/storage'

export default function SetupStoragePage() {
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCreateBucket() {
    setLoading(true)
    setStatus(null)

    try {
      const result = await createProductImagesBucket()
      if (result.success) {
        setStatus(`Success: ${result.message}`)
      } else {
        setStatus(`Error: ${result.error}`)
      }
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 p-8">
      <div className="w-full max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-black dark:text-white mb-4">
          Setup Storage Bucket
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Create the product-images storage bucket required for uploading product photos.
        </p>

        <div className="bg-white dark:bg-black rounded-lg border border-gray-200 dark:border-gray-800 p-6 space-y-6">
          <button
            onClick={handleCreateBucket}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create/Update product-images Bucket'}
          </button>

          {status && (
            <div
              className={`p-4 rounded-lg ${
                status.includes('Error')
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                  : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
              }`}
            >
              {status}
            </div>
          )}

          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <h3 className="font-semibold mb-2 text-yellow-800 dark:text-yellow-200">
              Important: RLS Policies Setup Required
            </h3>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
              After creating the bucket, you need to set up Row-Level Security (RLS) policies in
              Supabase Dashboard to allow uploads:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-yellow-700 dark:text-yellow-300">
              <li>Go to Supabase Dashboard → Storage → Policies</li>
              <li>Select the "product-images" bucket</li>
              <li>Click "New Policy"</li>
              <li>
                Create these policies:
                <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                  <li>
                    <strong>SELECT:</strong> Allow public read access (USING: bucket_id =
                    'product-images')
                  </li>
                  <li>
                    <strong>INSERT:</strong> Allow uploads (WITH CHECK: bucket_id =
                    'product-images')
                  </li>
                  <li>
                    <strong>UPDATE:</strong> Allow updates (USING: bucket_id = 'product-images')
                  </li>
                  <li>
                    <strong>DELETE:</strong> Allow deletes (USING: bucket_id = 'product-images')
                  </li>
                </ul>
              </li>
            </ol>
            <p className="text-xs mt-3 text-yellow-600 dark:text-yellow-400">
              Or use the SQL Editor to run the policies from{' '}
              <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">
                supabase/migrations/0008_storage_policies.sql
              </code>
            </p>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <h3 className="font-semibold mb-2">Manual Setup (Alternative)</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li>Go to your Supabase Dashboard</li>
              <li>Navigate to Storage</li>
              <li>Click "New bucket"</li>
              <li>
                Name it: <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">product-images</code>
              </li>
              <li>Set it to <strong>Public</strong></li>
              <li>Click "Create bucket"</li>
              <li>Then set up RLS policies as described above</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
