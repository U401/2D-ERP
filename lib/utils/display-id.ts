'use client'

/**
 * Convert a UUID (or any long id string) into a short, human-friendly display ID.
 *
 * Examples:
 * - formatDisplayId('9c6fa081-6cdd-4e49-9165-c37bf5c316f1', 'SES') -> 'SES-316F1'
 * - formatDisplayId('d7b99c1e-99bb-4985-9eba-b4075e51c05b', 'ORD', 8) -> 'ORD-51C05B'
 */
export function formatDisplayId(
  id: string | null | undefined,
  prefix?: string,
  length: number = 6
) {
  if (!id) return '—'

  const cleaned = String(id).replace(/[^a-zA-Z0-9]/g, '')
  if (!cleaned) return '—'

  const safeLen = Math.max(4, Math.min(12, length))
  const suffix = cleaned.slice(-safeLen).toUpperCase()
  return prefix ? `${prefix}-${suffix}` : suffix
}















