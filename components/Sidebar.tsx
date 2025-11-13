'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Sidebar() {
  const pathname = usePathname()

  const isActive = (path: string) => pathname === path

  return (
    <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-200 p-4 hidden md:flex md:flex-col">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 bg-gradient-to-br from-green-400 to-green-600"></div>
          <div className="flex flex-col">
            <h1 className="text-gray-900 text-base font-medium leading-normal">
              The Daily Grind
            </h1>
            <p className="text-gray-600 text-sm font-normal leading-normal">
              ERP System
            </p>
          </div>
        </div>
        <nav className="flex flex-col gap-2 mt-6">
          <Link
            href="/pos"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive('/pos')
                ? 'bg-gray-100 hover:bg-gray-200'
                : 'hover:bg-gray-50'
            }`}
          >
            <span
              className="material-symbols-outlined text-gray-900"
              style={{
                fontSize: '24px',
                fontVariationSettings: isActive('/pos') ? "'FILL' 1" : "'FILL' 0",
              }}
            >
              storefront
            </span>
            <p className="text-gray-900 text-sm font-medium leading-normal">POS</p>
          </Link>
          <Link
            href="/inventory"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive('/inventory')
                ? 'bg-gray-100 hover:bg-gray-200'
                : 'hover:bg-gray-50'
            }`}
          >
            <span
              className="material-symbols-outlined text-gray-900"
              style={{
                fontSize: '24px',
                fontVariationSettings: isActive('/inventory')
                  ? "'FILL' 1"
                  : "'FILL' 0",
              }}
            >
              inventory_2
            </span>
            <p className="text-gray-900 text-sm font-medium leading-normal">
              Inventory
            </p>
          </Link>
          <Link
            href="/reports"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive('/reports')
                ? 'bg-gray-100 hover:bg-gray-200'
                : 'hover:bg-gray-50'
            }`}
          >
            <span
              className="material-symbols-outlined text-gray-900"
              style={{
                fontSize: '24px',
                fontVariationSettings: isActive('/reports')
                  ? "'FILL' 1"
                  : "'FILL' 0",
              }}
            >
              assessment
            </span>
            <p className="text-gray-900 text-sm font-medium leading-normal">
              Reports
            </p>
          </Link>
        </nav>
      </div>
    </aside>
  )
}

