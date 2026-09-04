'use client'

/**
 * Returns a stable identifier for the current app window/instance.
 *
 * - Uses `window.name` because it persists for the lifetime of the window (survives reloads).
 * - Namespaces it with `erp:` to avoid collisions.
 */
export function getInstanceId(): string {
  if (typeof window === 'undefined') return 'server'

  const existing = (window.name || '').trim()
  if (!existing || existing === '_blank') {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? (crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    window.name = `erp:${id}`
  } else if (!existing.startsWith('erp:')) {
    window.name = `erp:${existing}`
  }

  return window.name
}















