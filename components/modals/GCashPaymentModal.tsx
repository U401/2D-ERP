'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { GCashVerificationResult } from '@/lib/types/gcash'

type Props = {
  totalAmount: number
  onClose: () => void
  onConfirm: (verificationResult: GCashVerificationResult & { imageUrl: string | null }) => Promise<void>
}

export default function GCashPaymentModal({ totalAmount, onClose, onConfirm }: Props) {
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<
    'idle' | 'processing' | 'confirmed' | 'rejected'
  >('idle')
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null)
  const [verificationResult, setVerificationResult] = useState<GCashVerificationResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(file: File) {
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Please upload a JPEG, PNG, or WebP image.')
      return
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      alert('File size exceeds 10MB limit. Please choose a smaller image.')
      return
    }

    setSelectedImage(file)
    setVerificationStatus('idle')
    setVerificationMessage(null)
    setVerificationResult(null)

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  function handleCameraClick() {
    cameraInputRef.current?.click()
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
  }

  async function handleVerify() {
    if (!selectedImage) {
      alert('Please select an image first')
      return
    }

    setIsProcessing(true)
    setVerificationStatus('processing')
    setVerificationMessage('Verifying transaction...')

    try {
      // Upload image to Supabase Storage first
      const supabase = createClient()
      const fileExt = selectedImage.name.split('.').pop()
      const fileName = `gcash/${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`
      
      // Upload to a private bucket (admin-only access)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('gcash-transactions')
        .upload(fileName, selectedImage, {
          contentType: selectedImage.type,
          upsert: false,
        })

      let imageUrl: string | null = null

      if (uploadError) {
        // If bucket doesn't exist, continue without storing image
        console.warn('Failed to upload image to storage:', uploadError)
        // Still proceed with verification
      } else {
        // Get signed URL for the image (private access)
        const { data: urlData } = supabase.storage
          .from('gcash-transactions')
          .createSignedUrl(fileName, 3600) // 1 hour expiry

        imageUrl = urlData?.signedUrl || null
      }

      // Call verification API
      const formData = new FormData()
      formData.append('image', selectedImage)

      const response = await fetch('/api/gcash/verify', {
        method: 'POST',
        body: formData,
      })

      const result: GCashVerificationResult = await response.json()

      setVerificationResult(result)

      if (result.success && result.status === 'confirmed') {
        setVerificationStatus('confirmed')
        setVerificationMessage('Transaction verified successfully!')
        
        // Call onConfirm with the result and image URL
        // Wait for confirmation to complete before closing modal
        try {
          await onConfirm({
            ...result,
            imageUrl,
          })
          // Modal will be closed by parent component after successful confirmation
        } catch (error) {
          console.error('Error in onConfirm callback:', error)
          setVerificationStatus('rejected')
          setVerificationMessage('Failed to complete payment. Please try again.')
        }
      } else {
        setVerificationStatus('rejected')
        setVerificationMessage(
          result.error || `Transaction rejected: ${result.rejectionReason || 'Unknown reason'}`
        )
      }
    } catch (error) {
      console.error('Verification error:', error)
      setVerificationStatus('rejected')
      setVerificationMessage(
        error instanceof Error ? error.message : 'Failed to verify transaction'
      )
    } finally {
      setIsProcessing(false)
    }
  }

  function handleRemoveImage() {
    setSelectedImage(null)
    setImagePreview(null)
    setVerificationStatus('idle')
    setVerificationMessage(null)
    setVerificationResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = ''
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0a0a0a] rounded-xl w-full max-w-md border border-gray-800 m-4 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">GCash Payment</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Amount Display */}
          <div className="text-center pb-4 border-b border-gray-800">
            <p className="text-gray-400 text-sm">Total Amount</p>
            <p className="text-white text-2xl font-bold">${totalAmount.toFixed(2)}</p>
          </div>

          {/* Image Preview */}
          {imagePreview && (
            <div className="relative">
              <img
                src={imagePreview}
                alt="Transaction screenshot"
                className="w-full rounded-lg border border-gray-700"
              />
              <button
                onClick={handleRemoveImage}
                className="absolute top-2 right-2 bg-black/70 hover:bg-black/90 text-white rounded-full p-2 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          )}

          {/* Upload Area */}
          {!imagePreview && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center w-full border-2 border-dashed border-gray-700 rounded-lg p-8 text-center bg-gray-900/50 cursor-pointer hover:border-gray-600 transition-colors"
            >
              <span className="material-symbols-outlined text-gray-500 !text-5xl">upload_file</span>
              <p className="mt-2 text-sm text-gray-400">
                Drag & drop or <span className="font-semibold text-white">browse</span> to upload
              </p>
              <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 10MB</p>
            </div>
          )}

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleFileInputChange}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            capture="environment"
            onChange={handleFileInputChange}
            className="hidden"
          />

          {/* Divider */}
          {!imagePreview && (
            <div className="flex items-center gap-4">
              <div className="flex-1 border-t border-gray-700"></div>
              <span className="text-gray-500 text-xs">OR</span>
              <div className="flex-1 border-t border-gray-700"></div>
            </div>
          )}

          {/* Camera Button */}
          {!imagePreview && (
            <button
              onClick={handleCameraClick}
              className="w-full flex items-center justify-center gap-2 h-12 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              <span className="material-symbols-outlined">photo_camera</span>
              <span className="text-sm font-medium">Use Camera</span>
            </button>
          )}

          {/* Verification Status */}
          {verificationStatus !== 'idle' && (
            <div
              className={`p-4 rounded-lg ${
                verificationStatus === 'confirmed'
                  ? 'bg-green-900/30 border border-green-700'
                  : verificationStatus === 'rejected'
                  ? 'bg-red-900/30 border border-red-700'
                  : 'bg-gray-900/50 border border-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                {verificationStatus === 'processing' && (
                  <span className="material-symbols-outlined animate-spin text-gray-400">
                    hourglass_empty
                  </span>
                )}
                {verificationStatus === 'confirmed' && (
                  <span className="material-symbols-outlined text-green-400">check_circle</span>
                )}
                {verificationStatus === 'rejected' && (
                  <span className="material-symbols-outlined text-red-400">error</span>
                )}
                <p
                  className={`text-sm font-medium ${
                    verificationStatus === 'confirmed'
                      ? 'text-green-300'
                      : verificationStatus === 'rejected'
                      ? 'text-red-300'
                      : 'text-gray-300'
                  }`}
                >
                  {verificationMessage || 'Processing...'}
                </p>
              </div>
              {verificationResult?.transactionData && (
                <div className="mt-2 text-xs text-gray-400 space-y-1">
                  <p>
                    Reference: {verificationResult.transactionData.referenceCode}
                  </p>
                  <p>
                    Time:{' '}
                    {new Date(
                      verificationResult.transactionData.transactionTimestamp
                    ).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleVerify}
            disabled={!selectedImage || isProcessing || verificationStatus === 'confirmed'}
            className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? 'Verifying...' : verificationStatus === 'confirmed' ? 'Verified' : 'Verify & Complete'}
          </button>
        </div>
      </div>
    </div>
  )
}



