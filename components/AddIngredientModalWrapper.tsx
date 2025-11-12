'use client'

import { useRouter } from 'next/navigation'
import AddIngredientModal from './modals/AddIngredientModal'

export default function AddIngredientModalWrapper() {
  const router = useRouter()

  return (
    <AddIngredientModal
      onClose={() => {
        router.push('/inventory')
      }}
    />
  )
}

