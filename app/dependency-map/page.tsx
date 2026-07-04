// Dependency Map — Observed-First Map (GraphViewV2).
//
// VPC → Subnet → Component hierarchy with observed traffic only.
// Distinct from the System Map (traffic-flow-map.tsx) which is the
// column-swimlane path-flow view, and from the legacy Graph View
// (graph-view.tsx) which is the cytoscape force-directed view.
//
// Deep-linkable via ?system={name}. With no param, the page resolves the
// first system from /api/systems — never a pinned environment (a defaulted
// demo system silently rendered the wrong tenant's map everywhere else).

"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import GraphViewV2 from "@/components/dependency-map/graph-view-v2"

function DependencyMapView() {
  const searchParams = useSearchParams()
  const fromUrl = searchParams?.get("system") ?? null
  const [systemName, setSystemName] = useState<string | null>(fromUrl)
  const [resolving, setResolving] = useState(fromUrl === null)

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
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 text-sm text-slate-500">
        Resolving system…
      </div>
    )
  }
  if (!systemName) {
    // Honest empty state — no systems discovered, nothing to fabricate.
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 text-sm text-slate-500">
        No systems available yet. Run a sync, then open a system from the dashboard.
      </div>
    )
  }
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
