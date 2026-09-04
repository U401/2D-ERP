import { useEffect, useRef } from 'react'

/**
 * A custom hook to automatically run a refresh callback on a specified interval.
 * Uses a ref to ensure the latest callback is always called without resetting the interval.
 * 
 * @param callback The function to execute on each tick
 * @param intervalMs The interval in milliseconds (default: 15000ms / 15s)
 * @param dependencies Optional dependency array to restart the interval
 */
export function useAutoRefresh(
  callback: () => Promise<void> | void,
  intervalMs: number = 15000,
  dependencies: any[] = []
) {
  const savedCallback = useRef(callback)

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  // Set up the interval
  useEffect(() => {
    // Only set up the interval if we have an interval > 0
    if (intervalMs <= 0) return

    const tick = async () => {
      try {
        await savedCallback.current()
      } catch (error) {
        console.error('AutoRefresh error:', error)
      }
    }

    const id = setInterval(tick, intervalMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...dependencies])
}
