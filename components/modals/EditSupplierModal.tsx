'use client'

import { useState } from 'react'
import { updateSupplier } from '@/app/actions/suppliers'

type Supplier = {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
}

type Props = {
  supplier: Supplier
  onClose: () => void
  onSuccess: () => void
}

export default function EditSupplierModal({
  supplier,
  onClose,
  onSuccess,
}: Props) {
  const [formData, setFormData] = useState({
    name: supplier.name,
    contact_person: supplier.contact_person || '',
    phone: supplier.phone || '',
    email: supplier.email || '',
  })
  const [isProcessing, setIsProcessing] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsProcessing(true)

    try {
      const result = await updateSupplier(supplier.id, {
        name: formData.name,
        contact_person: formData.contact_person || undefined,
        phone: formData.phone || undefined,
        email: formData.email || undefined,
      })
      if (result.success) {
        onSuccess()
        onClose()
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-xl border border-gray-200 shadow-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Edit Supplier</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            <div className="grid grid-cols-1 gap-6">
              <label className="flex flex-col">
                <p className="text-sm font-medium text-gray-700 pb-2">Supplier Name</p>
                <input
                  required
                  className="form-input w-full rounded-lg text-gray-900 bg-input-gray border border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 h-12 px-4 placeholder:text-gray-500 text-base font-normal"
                  placeholder="Enter supplier name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </label>

              <label className="flex flex-col">
                <p className="text-sm font-medium text-gray-700 pb-2">
                  Contact Person (Optional)
                </p>
                <input
                  className="form-input w-full rounded-lg text-gray-900 bg-input-gray border border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 h-12 px-4 placeholder:text-gray-500 text-base font-normal"
                  placeholder="Enter contact name"
                  value={formData.contact_person}
                  onChange={(e) =>
                    setFormData({ ...formData, contact_person: e.target.value })
                  }
                />
              </label>

              <label className="flex flex-col">
                <p className="text-sm font-medium text-gray-700 pb-2">Phone Number</p>
                <input
                  className="form-input w-full rounded-lg text-gray-900 bg-input-gray border border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 h-12 px-4 placeholder:text-gray-500 text-base font-normal"
                  placeholder="Enter phone number"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </label>

              <label className="flex flex-col">
                <p className="text-sm font-medium text-gray-700 pb-2">Email Address</p>
                <input
                  type="email"
                  className="form-input w-full rounded-lg text-gray-900 bg-input-gray border border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 h-12 px-4 placeholder:text-gray-500 text-base font-normal"
                  placeholder="Enter email address"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 p-6 bg-gray-50 rounded-b-xl border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-button-gray text-gray-900 text-sm font-medium leading-normal tracking-wide hover:bg-[#D0D0D0] transition-colors border border-gray-200"
            >
              <span className="truncate">Cancel</span>
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-button-gray text-gray-900 text-sm font-medium leading-normal tracking-wide hover:bg-[#D0D0D0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
            >
              <span className="truncate">
                {isProcessing ? 'Saving...' : 'Save Changes'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

