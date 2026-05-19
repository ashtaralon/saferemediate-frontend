"use client"

// Data Leak Flow Map — renders the INNER architecture diagram from
// the System Map renderer (UnifiedArchitectureDiagram) inside a
// minimal per-path header. We deliberately do NOT use the full
// TrafficFlowMap wrapper here — that wrapper is the system-level
// dashboard (Pause/Auto/Heatmap/VPC/Export/Refresh/Time Travel,
// "Sync failed" status, Attack Paths controls). Inside a per-path
// leak card, all of that chrome is wrong; we only want the canvas:
// dark background, animated SVG curves, ServiceNodeBox node cards,
// STACK COMPONENTS sidebar, LIVE pill, crown-jewel marker, and the
// traffic/connections metrics — exactly what UnifiedArchitectureDiagram
// renders.
//
// We feed it a SystemArchitecture built from one DataLeakPath:
//   COMPUTE      = workload
//   SUBNETS      = workload's subnet
//   SG           = workload's security group (with the public-egress flag)
//   NACL         = workload's NACL
//   IAM ROLES    = workload's IAM role  (which is "workload identity"
//                                        in egress terms — same node)
//   RESOURCES    = data store (crown jewel) + each observed external
//                  destination as an additional resource node
//   API CALLS    = observed actions on the data store
//   flows        = (workload → data store) with the real CloudTrail
//                  event count + bytes, and (workload → each destination)
//                  with per-destination VPC Flow Log bytes/hits.
//
// `observedMode` is on so the renderer drops the "(simulated)" tag
// and the "Gaps" header badge (both are Attack-Paths-flavored).

import {
  UnifiedArchitectureDiagram,
  type NodeType,
  type SecurityCheckpoint,
  type ServiceNode,
  type SubnetNode,
  type SystemArchitecture,
  type TrafficFlow,
} from "@/components/dependency-map/traffic-flow-map"
import type { DataLeakPath } from "@/lib/types"

interface Props {
  path: DataLeakPath
}

export function DataLeakFlowMap({ path }: Props) {
  const architecture = buildArchitecture(path)
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
        <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-600">
          Egress flow map
        </div>
        <span className="ml-auto text-[11px] text-slate-600 font-mono">
          Path → {path.dataStore.name}
        </span>
      </div>
      {/* Dark backdrop — UnifiedArchitectureDiagram uses bg-slate-900/50
          which is designed for a dark page; without a dark parent the
          50%-opacity navy washes out into hazy gray. */}
      <div className="bg-slate-950 p-3">
        <UnifiedArchitectureDiagram
          architecture={architecture}
          animate={true}
          innerTitleOverride="Egress flow"
          innerSubtitleOverride="Observed read access + open network channel for this workload → data path"
          observedMode={true}
          onSelectService={() => {
            // No-op inside leak cards — mitigation actions live in the
            // panel below, not behind node clicks.
          }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DataLeakPath → SystemArchitecture
// ---------------------------------------------------------------------------

function buildArchitecture(path: DataLeakPath): SystemArchitecture {
  const w = path.workload
  const dests = path.networkPlane.internetDestinations

  const computeServices: ServiceNode[] = [
    {
      id: w.id,
      name: w.name,
      shortName: w.name,
      type: workloadNodeType(w.type),
      instanceId: w.id,
    },
  ]

  // Resources lane = EGRESS TARGETS, i.e. where traffic leaves the VPC
  // to. NOT the crown jewel data store — the data store is the value
  // AT RISK (already named in the card title + risk explanation above
  // the map), not the egress destination. The whole point of this map
  // is to answer "where can this workload phone home?".
  //
  //   wired + N destinations  → render each observed destination
  //   wired + 0 destinations  → single "Open internet" placeholder,
  //                             so the SG → 0.0.0.0/0 path is visible
  //                             even when unused (the killer-slide
  //                             "egress open, no observed traffic")
  //   not_wired / loading     → empty (parent shows the "not wired"
  //                             copy elsewhere)
  const resources: ServiceNode[] = []
  if (dests._state === "wired" && dests.topDestinations.length > 0) {
    dests.topDestinations.slice(0, 5).forEach((d, i) => {
      const idBase = d.ip || `dest-${i}`
      const primary = d.service
        ? humanService(d.service)
        : d.org || d.ip || "Destination"
      const secondary = d.ip || ""
      resources.push({
        id: `dest:${idBase}:${i}`,
        name: primary,
        shortName: secondary || primary,
        type: destNodeType(d.kind),
      })
    })
  } else if (dests._state === "wired") {
    resources.push({
      id: "egress:open-internet",
      name: "Open internet",
      shortName: "0.0.0.0/0",
      type: "internet",
    })
  }

  const subnets: SubnetNode[] = w.subnet.id
    ? [
        {
          id: w.subnet.id,
          name: w.subnet.name || w.subnet.id,
          shortName: w.subnet.name || w.subnet.id,
          isPublic: w.subnet.isPublic ?? null,
          connectedComputeIds: [w.id],
        },
      ]
    : []

  const securityGroups: SecurityCheckpoint[] = w.securityGroup.id
    ? [
        {
          id: w.securityGroup.id,
          type: "security_group",
          name: w.securityGroup.name || w.securityGroup.id,
          shortName: w.securityGroup.name || w.securityGroup.id,
          usedCount: 0,
          totalCount: 0,
          // Public-egress posture flagged (Gaps badge is suppressed
          // by observedMode but the upstream signal stays correct).
          gapCount: w.securityGroup.hasPublicEgress ? 1 : 0,
          connectedSources: [w.id],
          connectedTargets: resources.map((r) => r.id),
        },
      ]
    : []

  const nacls: SecurityCheckpoint[] = w.nacl?.id
    ? [
        {
          id: w.nacl.id,
          type: "nacl",
          name: w.nacl.id,
          shortName: w.nacl.id,
          usedCount: 0,
          totalCount: 0,
          gapCount: 0,
          connectedSources: [w.id],
          connectedTargets: resources.map((r) => r.id),
        },
      ]
    : []

  // IAM role is intentionally NOT in the egress map. The IAM role
  // explains why the workload can READ the crown jewel — that lives
  // in the data-plane half of the path (description + the "Remove
  // unused permission" mitigation card). Egress is a network-plane
  // concern: subnet → SG → NACL → internet/destinations.
  const iamRoles: SecurityCheckpoint[] = []

  // Flows: workload → each egress target. sgId/naclId set so the
  // ConnectionLinesSVG draws lines through those checkpoints. No
  // roleId — egress doesn't traverse the IAM role.
  const sgId = w.securityGroup.id ?? undefined
  const naclId = w.nacl?.id ?? undefined
  const flows: TrafficFlow[] = []
  if (dests._state === "wired" && dests.topDestinations.length > 0) {
    dests.topDestinations.slice(0, 5).forEach((d, i) => {
      const idBase = d.ip || `dest-${i}`
      flows.push({
        sourceId: w.id,
        targetId: `dest:${idBase}:${i}`,
        sgId,
        naclId,
        ports: [],
        protocol: "tcp",
        bytes: d.bytes ?? 0,
        connections: d.hits ?? 0,
        isActive: (d.hits ?? 0) > 0,
      })
    })
  } else if (dests._state === "wired") {
    // Open-but-unused: a single flow workload → "Open internet"
    // with 0 bytes / 0 hits, marking the path as available but
    // not exercised. The SG public-egress flag carries the risk.
    flows.push({
      sourceId: w.id,
      targetId: "egress:open-internet",
      sgId,
      naclId,
      ports: [],
      protocol: "tcp",
      bytes: 0,
      connections: 0,
      isActive: false,
    })
  }

  return {
    computeServices,
    resources,
    subnets,
    securityGroups,
    nacls,
    iamRoles,
    flows,
    totalBytes: flows.reduce((s, f) => s + (f.bytes || 0), 0),
    totalConnections: flows.reduce((s, f) => s + (f.connections || 0), 0),
    totalGaps: 0,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function workloadNodeType(type: string): NodeType {
  const t = type.toLowerCase()
  if (t.includes("lambda")) return "lambda"
  return "compute"
}

function destNodeType(kind?: string | null): NodeType {
  if (kind === "aws") return "api_gateway"
  return "internet"
}

function humanService(svc: string): string {
  const map: Record<string, string> = {
    s3: "Object storage",
    dynamodb: "Key-value store",
    kms: "Key management",
    ec2: "Compute control plane",
    ssm: "Systems management",
    sts: "Identity broker",
    secretsmanager: "Secret store",
    rds: "Managed database",
    lambda: "Function runtime",
    cloudwatch: "Telemetry",
    logs: "Log ingestion",
    sqs: "Message queue",
    sns: "Pub/sub",
  }
  return map[svc.toLowerCase()] || svc
}
