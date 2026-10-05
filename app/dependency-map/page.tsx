// Dependency Map — Observed-First Map (GraphViewV2).
//
// VPC → Subnet → Component hierarchy with observed traffic only.
// Distinct from the System Map (traffic-flow-map.tsx) which is the
// column-swimlane path-flow view, and from the legacy Graph View
// (graph-view.tsx) which is the cytoscape force-directed view.
//
// Deep-linkable via ?system={name} (plus customer_id / account_id / region for a catalogue row that carries an identity).
// With no param, the page opens the first system whose label is not repeated in the scoped catalogue -- never a pinned
// environment, and never the first of several accounts serving one label (T10 S1: those get a chooser).

"use client"

import { Suspense } from "react"
import GraphViewV2 from "@/components/dependency-map/graph-view-v2"
import { CatalogSelectionNotice } from "@/components/system-guard"
import {
  selectCatalogSystem,
  usePinnedSystemRequest,
  useScopedSystemCatalogEntries,
} from "@/lib/scoped-system-catalog"

function DependencyMapView() {
  const requested = usePinnedSystemRequest()
  const fromUrl = requested.system
  const catalog = useScopedSystemCatalogEntries()

  if (catalog.state === "loading") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 text-sm text-slate-500">
        Resolving system…
      </div>
    )
  }
  if (catalog.state === "unavailable") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 text-sm text-slate-500">
        The systems of this scope could not be read.
      </div>
    )
  }
  const selection = selectCatalogSystem(requested, catalog.entries)
  if (selection.kind === "NONE" && catalog.entries.length === 0) {
    // Honest empty state — no systems discovered, nothing to fabricate.
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 text-sm text-slate-500">
        No systems available yet. Run a sync, then open a system from the dashboard.
      </div>
    )
  }
  if (selection.kind !== "SELECTED") {
    return (
      <div className="h-screen w-full overflow-auto bg-slate-50">
        <CatalogSelectionNotice selection={selection} systemName={fromUrl} pathname="/dependency-map" back={false} />
      </div>
    )
  }
  return (
    <div className="h-screen w-full overflow-hidden bg-slate-50">
      <GraphViewV2 systemName={selection.entry.name} />
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
