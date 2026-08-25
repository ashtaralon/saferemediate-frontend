"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Loads the lane capability map once, so a refresh control knows whether it can
 * do anything before it is clicked.
 *
 * `null` means "we do not know" — either still loading, or the call failed.
 * Downstream that resolves to UNKNOWN, and UNKNOWN keeps the control DISABLED.
 *
 * That is deliberate, and it is the opposite of what this hook first did. The
 * original reasoning was that an unknown capability should not "falsely
 * disable a working feature on a transient error", so it fell through to
 * enabled. But the cost is not symmetric: enabling on an assumption spends a
 * real AWS collection round to discover what /capabilities would have said for
 * free, and — because a round completes whatever it collected — invites the
 * screen to treat that round as its own freshness. Disabling costs a retry.
 *
 * So a failure is surfaced (`capabilitiesError`) with a way to retry, rather
 * than silently resolved in the permissive direction.
 */
export function useSyncCapabilities() {
  const [capabilities, setCapabilities] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const response = await fetch("/api/proxy/sync/capabilities", { signal })
      if (!response.ok) {
        setCapabilities(null)
        setError(true)
        return
      }
      const data = (await response.json()) as Record<string, unknown>
      const usable = Array.isArray(data?.lanes)
      setCapabilities(usable ? data : null)
      setError(!usable)
    } catch (err) {
      // An aborted request is this component unmounting, not a backend fault.
      if ((err as Error)?.name === "AbortError") return
      setCapabilities(null)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return {
    capabilities,
    loadingCapabilities: loading,
    capabilitiesError: error,
    reloadCapabilities: () => void load(),
  }
}
