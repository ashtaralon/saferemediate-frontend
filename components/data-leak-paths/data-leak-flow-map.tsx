"use client"

// Data Leak Flow Map — thin wrapper over the existing TrafficFlowMap
// component used by Attack Paths. Builds a TrafficFlowMapPathFilter
// from a single (workload → crown-jewel) DataLeakPath so the same
// visual treatment (dark canvas, animated SVG curves, lane layout,
// STACK COMPONENTS sidebar, LIVE badge) applies here verbatim.
//
// This replaces the earlier custom dual-strip design — the operator
// wanted the Attack Paths flow map as-is, applied to each data-leak
// path. The dual-plane framing now lives in two places:
//   - this flow map shows the workload → subnet → SG → NACL → role →
//     resource chain (the network + IAM control planes)
//   - the InternetDestinationsTable rendered next to this component
//     surfaces the EGRESS plane (where the workload could phone home)
// The combination keeps the closure-by-observation story intact.
//
// Architecture is fetched by TrafficFlowMap itself from
// /api/proxy/dependency-map/full?systemName=...; all path-card
// instances on the same systemName share that fetch via the
// useCachedFetch + Vercel proxy cache, so 9 paths inline is one
// network call, not nine.

import TrafficFlowMap, {
  type TrafficFlowMapPathFilter,
} from "@/components/dependency-map/traffic-flow-map"
import type { DataLeakPath } from "@/lib/types"

interface Props {
  systemName: string
  path: DataLeakPath
}

export function DataLeakFlowMap({ systemName, path }: Props) {
  const filter = buildPathFilter(path)
  return <TrafficFlowMap systemName={systemName} pathFilter={filter} />
}

// ---------------------------------------------------------------------------
// PathFilter construction
// ---------------------------------------------------------------------------

function buildPathFilter(path: DataLeakPath): TrafficFlowMapPathFilter {
  // The set of node IDs that should survive the filter. TrafficFlowMap's
  // applyPathFilter keeps nodes whose id is in this set OR (for subnets
  // specifically) is attached to a path compute. That's enough to put
  // every step of the (workload, store) chain on the canvas.
  const ids: Array<string | null | undefined> = [
    path.workload.id,
    path.workload.subnet.id,
    path.workload.securityGroup.id,
    path.workload.nacl?.id,
    path.workload.iamRole.id,
    path.workload.routeTable.id,
    path.workload.routeTable.egressGate?.id,
    path.workload.instanceProfile?.name,
    path.dataStore.id,
  ]
  const nodeIds: string[] = ids.filter((v): v is string => typeof v === "string" && v.length > 0)

  const observed = path.dataPlane.observedApiCalls
  const actionsLabel = observed.actions?.length
    ? observed.actions.slice(0, 3).join(", ") +
      (observed.actions.length > 3 ? `, +${observed.actions.length - 3}` : "")
    : undefined

  // The single load-bearing edge for the leak: role (or workload if no
  // role) → data store. Carries observed access count + bytes so the
  // canvas renders a labeled traffic edge in the same way Attack Paths
  // labels its edges.
  const pathEdges = [
    {
      source: path.workload.iamRole.id || path.workload.id,
      target: path.dataStore.id,
      type: "data_access",
      label: actionsLabel,
      bytes: observed.totalBytes ?? 0,
      hits: observed.totalEvents ?? 0,
      is_observed: observed._state === "wired",
    },
  ].filter((e) => e.source && e.target)

  return {
    nodeIds,
    pathEdges,
    crownJewelIds: [path.dataStore.id],
    jewelName: path.dataStore.name,
    pathLabel: `${path.workload.name} → ${path.dataStore.name}`,
  }
}
