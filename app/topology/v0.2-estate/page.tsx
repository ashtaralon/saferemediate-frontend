"use client"

/**
 * Topology v0.2 — Estate view (live data).
 *
 * Thin page wrapper: reads `systemName` from the URL (defaulting to
 * "alon-prod") and renders the shared <EstateMapView/>. The map itself —
 * HeadlineStrip + AwsFrame + FilterRail + DetailPanel, all live from
 * /api/proxy/topology-risk/{system} per docs/topology-v0.2-risk-contract.md —
 * lives in components/topology-v0-2/estate-map-view.tsx so the exact same map
 * can be embedded 1:1 inside each system dashboard's Topology tab.
 */

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { EstateMapView } from "@/components/topology-v0-2/estate-map-view"

function EstateView() {
  const params = useSearchParams()
  const systemName = params.get("systemName") || "alon-prod"
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
