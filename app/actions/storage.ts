'use server'

import { createServerClient } from '@/lib/supabase/server'

export async function createProductImagesBucket() {
  const supabase = createServerClient()

  // Check if bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets()

  if (listError) {
    return { success: false, error: listError.message }
  }

  const bucketExists = buckets?.some((b) => b.name === 'product-images')

  if (bucketExists) {
    // Update bucket to ensure it's public
    const { error: updateError } = await supabase.storage.updateBucket('product-images', {
      public: true,
    })

    if (updateError) {
      return {
        success: false,
        error: `Bucket exists but couldn't update: ${updateError.message}. Please set it to Public manually in Supabase Dashboard.`,
      }
    }

    return {
      success: true,
      message: 'Bucket already exists and is configured',
      error: null,
    }
  }

  // Create the bucket
  const { data, error } = await supabase.storage.createBucket('product-images', {
    public: true,
    fileSizeLimit: 5242880, // 5MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return {
    success: true,
    message:
      'Bucket created successfully. Note: You may need to configure RLS policies in Supabase Dashboard > Storage > Policies if uploads fail.',
    error: null,
  }
}

export async function createGCashTransactionsBucket() {
  const supabase = createServerClient()

  // Check if bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets()

  if (listError) {
    return { success: false, error: listError.message }
  }

  const bucketExists = buckets?.some((b) => b.name === 'gcash-transactions')

  if (bucketExists) {
    // Update bucket to ensure it's private (not public)
    const { error: updateError } = await supabase.storage.updateBucket('gcash-transactions', {
      public: false, // Private bucket for security
    })

    if (updateError) {
      return {
        success: false,
        error: `Bucket exists but couldn't update: ${updateError.message}. Please set it to Private manually in Supabase Dashboard.`,
      }
    }

    return {
      success: true,
      message: 'Bucket already exists and is configured',
      error: null,
    }
  }

  // Create the bucket (PRIVATE for security)
  const { data, error } = await supabase.storage.createBucket('gcash-transactions', {
    public: false, // Private bucket - admin-only access
    fileSizeLimit: 10485760, // 10MB
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return {
    success: true,
    message:
      'Bucket created successfully. Note: You may need to configure RLS policies in Supabase Dashboard > Storage > Policies if uploads fail.',
    error: null,
  }
}

