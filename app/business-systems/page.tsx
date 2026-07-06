"use client"

/**
 * Business System Blast Radius — page route (/business-systems).
 *
 * Thin wrapper mirroring /topology/v0.2-estate: reads the system from the URL
 * (?systemName= or ?system=); with no param it resolves the first system from
 * /api/proxy/systems (never a pinned demo tenant) and renders the shared
 * <BlastRadiusView/>. The view fetches /api/proxy/business-system/{system}/
 * blast-radius and renders the 7 sections — all live, no mock.
 */

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { BlastRadiusView } from "@/components/business-system/blast-radius-view"

const SHELL = "min-h-screen p-8"
const SHELL_STYLE = { background: "#F4F6F8", color: "#5A6B7A" }

function BusinessSystemsView() {
  const params = useSearchParams()
  const fromUrl = params.get("systemName") || params.get("system")
  const [systemName, setSystemName] = useState<string | null>(fromUrl)
  const [resolving, setResolving] = useState(!fromUrl)

  useEffect(() => {
    if (fromUrl) {
      setSystemName(fromUrl)
      setResolving(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/proxy/systems", { cache: "no-store" })
        const json = res.ok ? await res.json() : {}
        const name = (json.systems ?? [])[0]?.name
        if (!cancelled) setSystemName(typeof name === "string" && name ? name : null)
      } catch {
        if (!cancelled) setSystemName(null)
      } finally {
        if (!cancelled) setResolving(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fromUrl])

  if (resolving) {
    return (
      <div className={SHELL} style={SHELL_STYLE}>
        Resolving system…
      </div>
    )
  }
  if (!systemName) {
    return (
      <div className={SHELL} style={SHELL_STYLE}>
        No systems available yet. Run a sync, then open a system from the dashboard.
      </div>
    )
  }
  return <BlastRadiusView systemName={systemName} />
}

export default function BusinessSystemsPage() {
  return (
    <Suspense
      fallback={
        <div className={SHELL} style={SHELL_STYLE}>
          Loading…
        </div>
      }
    >
      <BusinessSystemsView />
    </Suspense>
  )
}
