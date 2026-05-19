"use client"

// Data Leak Flow Map — thin wrapper that builds a SystemArchitecture
// from a single DataLeakPath and feeds it through the canonical
// TrafficFlowMap renderer. The renderer is the same one Attack Paths
// uses, so both pages share visual language: dark canvas, animated
// SVG curves, ServiceNodeBox node cards, STACK COMPONENTS sidebar,
// LIVE pill in the header.
//
// The architecture we hand the renderer represents the EGRESS path
// answer to "where could this workload phone home AND what data is
// reachable?" — single workload as the compute, the workload's
// subnet, SG, NACL, IAM role, the data store as the resource, and
// observed internet destinations as additional resources marked
// internet/external. flows[] carries the real bytes/connections from
// the data-leak backend response (NOT simulated).
//
// Per feedback_demo_safe_source_labels: vendor-neutral display strings.
// Per feedback_no_mock_numbers_in_ui: counts are real; absent data
// renders as the renderer's standard "0" not a fabricated value.

import TrafficFlowMap, {
  type NodeType,
  type ServiceNode,
  type SecurityCheckpoint,
  type SubnetNode,
  type SystemArchitecture,
  type TrafficFlow,
} from "@/components/dependency-map/traffic-flow-map"
import type { DataLeakPath } from "@/lib/types"

interface Props {
  systemName: string
  path: DataLeakPath
}

export function DataLeakFlowMap({ systemName, path }: Props) {
  const architecture = buildArchitecture(path)
  const titleOverride = "Egress Flow Map"
  const pathBadgeOverride = `Egress · ${path.workload.name} → ${path.dataStore.name}`
  return (
    <TrafficFlowMap
      systemName={systemName}
      architectureOverride={architecture}
      titleOverride={titleOverride}
      pathBadgeOverride={pathBadgeOverride}
      innerTitleOverride="Egress flow"
      innerSubtitleOverride="Real observed access + open network channel for this workload → data path"
      observedMode
    />
  )
}

// ---------------------------------------------------------------------------
// DataLeakPath → SystemArchitecture
// ---------------------------------------------------------------------------

function buildArchitecture(path: DataLeakPath): SystemArchitecture {
  // EGRESS — strictly the outbound network path. NO data store and NO
  // IAM role in this flow: those belong to the access plane (a separate
  // concern surfaced in the risk-explanation paragraph above the map).
  // What goes here:
  //   computeServices  = [workload]
  //   subnets          = workload's subnet (egress posture)
  //   securityGroups   = workload's SG (with 0.0.0.0/0 egress flag)
  //   nacls            = workload's NACL
  //   iamRoles         = [] (not egress; deliberately empty)
  //   resources        = ONLY internet destinations the workload phoned
  //                      home to. Each destination = one node card.
  //   flows            = workload → each destination, with REAL observed
  //                      bytes + hits per destination. No data-store flow.
  //
  // For LATENT paths (zero observed destinations) the resources array is
  // empty — the renderer naturally surfaces "No API Calls" / empty
  // RESOURCES lane. That's the honest answer: path is open, traffic is
  // zero. The "1.5M S3 events" lives in the access plane (text above
  // the flow map), NOT here.
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

  const resources: ServiceNode[] = []
  if (dests._state === "wired" && dests.topDestinations.length > 0) {
    dests.topDestinations.slice(0, 8).forEach((d, i) => {
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

  // IAM role left empty on purpose — not part of egress.
  const iamRoles: SecurityCheckpoint[] = []

  // Flows: workload → each observed destination. NO workload → data
  // store flow here. The bytes/hits come from per-destination observed
  // traffic, not from access events.
  const sgId = w.securityGroup.id ?? undefined
  const naclId = w.nacl?.id ?? undefined
  const flows: TrafficFlow[] = []
  if (dests._state === "wired") {
    dests.topDestinations.slice(0, 8).forEach((d, i) => {
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
  }

  const totalBytesSum = flows.reduce((s, f) => s + (f.bytes || 0), 0)
  const totalConnectionsSum = flows.reduce((s, f) => s + (f.connections || 0), 0)

  return {
    computeServices,
    resources,
    subnets,
    securityGroups,
    nacls,
    iamRoles,
    flows,
    totalBytes: totalBytesSum,
    totalConnections: totalConnectionsSum,
    totalGaps: 0,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function workloadNodeType(type: string): NodeType {
  const t = type.toLowerCase()
  if (t.includes("lambda")) return "lambda"
  if (t.includes("ecs") || t.includes("fargate")) return "compute"
  if (t.includes("ec2")) return "compute"
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
