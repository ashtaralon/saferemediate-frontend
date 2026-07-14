"use client"

/**
 * Topology v0.2 — Estate view (live data).
 *
 * Thin page wrapper: reads `systemName` from the URL; with no param it
 * resolves the WORST system from /api/systems (most criticals, then highs,
 * then lowest health — see lib/pick-worst-system; never a pinned environment)
 * and renders the shared <EstateMapView/>. The map itself —
 * HeadlineStrip + AwsFrame + FilterRail + DetailPanel, all live from
 * /api/proxy/topology-risk/{system} per docs/topology-v0.2-risk-contract.md —
 * lives in components/topology-v0-2/estate-map-view.tsx so the exact same map
 * can be embedded 1:1 inside each system dashboard's Topology tab.
 */

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { EstateMapView } from "@/components/topology-v0-2/estate-map-view"
import { pickWorstSystemName } from "@/lib/pick-worst-system"

function EstateView() {
  const params = useSearchParams()
  const fromUrl = params.get("systemName")
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
        // Default to the WORST system (most criticals, then highs, then lowest
        // health) — mirrors the dashboard's "Systems Needing Attention" ranking,
        // so a bare /topology/v0.2-estate lands on the system that needs eyes,
        // not an arbitrary first entry.
        if (!cancelled) setSystemName(pickWorstSystemName(json.systems))
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
    return <div className="min-h-screen p-8" style={{ background: "#F4F6F8", color: "#5A6B7A" }}>Resolving system…</div>
  }
  if (!systemName) {
    return (
      <div className="min-h-screen p-8" style={{ background: "#F4F6F8", color: "#5A6B7A" }}>
        No systems available yet. Run a sync, then open a system from the dashboard.
      </div>
    )
  }
  return <EstateMapView systemName={systemName} />
}

export default function TopologyV02EstatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen p-8" style={{ background: "#F4F6F8", color: "#5A6B7A" }}>Loading…</div>
      }
    >
      <EstateView />
    </Suspense>
  )
}
