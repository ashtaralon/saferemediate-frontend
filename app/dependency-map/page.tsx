// Dependency Map — Observed-First Map (GraphViewV2).
//
// VPC → Subnet → Component hierarchy with observed traffic only.
// Distinct from the System Map (traffic-flow-map.tsx) which is the
// column-swimlane path-flow view, and from the legacy Graph View
// (graph-view.tsx) which is the cytoscape force-directed view.
//
// Deep-linkable via ?system={name}; defaults to alon-prod (the
// canonical demo system) when no system is specified, matching the
// /attack-paths-v2?system= convention.

"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import GraphViewV2 from "@/components/dependency-map/graph-view-v2"

function DependencyMapView() {
  const searchParams = useSearchParams()
  // useSearchParams returns null on the server / before hydration; fall
  // back to the demo system so first paint always has something to render.
  const systemName = searchParams?.get("system") ?? "alon-prod"

  return (
    <div className="h-screen w-full overflow-hidden bg-slate-50">
      <GraphViewV2 systemName={systemName} />
    </div>
  )
}

export default function DependencyMapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-slate-50 text-sm text-slate-500">
          Loading dependency map…
        </div>
      }
    >
      <DependencyMapView />
    </Suspense>
  )
}
