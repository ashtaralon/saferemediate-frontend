"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Loads the lane capability map once, so a refresh control knows whether it can
 * do anything before it is clicked.
 *
 * Returns `null` until loaded and on failure — deliberately. Downstream that
 * resolves to UNKNOWN, which leaves a control neither falsely enabled (which
 * launches a pointless collection round) nor falsely disabled (which hides a
 * working feature on a transient error).
 */
export function useSyncCapabilities() {
  const [capabilities, setCapabilities] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/proxy/sync/capabilities", { signal })
      if (!response.ok) {
        setCapabilities(null)
        return
      }
      const data = (await response.json()) as Record<string, unknown>
      setCapabilities(Array.isArray(data?.lanes) ? data : null)
    } catch {
      setCapabilities(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return { capabilities, loadingCapabilities: loading }
}
