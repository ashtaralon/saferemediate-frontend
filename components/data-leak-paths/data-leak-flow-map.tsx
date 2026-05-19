"use client"

// Data Leak Flow Map — thin wrapper over the canonical TrafficFlowMap
// renderer used by Attack Paths. Same visual: dark canvas, animated
// SVG curves, ServiceNodeBox node cards, STACK COMPONENTS sidebar,
// LIVE pill, crown-jewel marker, traffic + connections metrics.
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
// Title overrides flip the header copy to egress-flavored language.

import TrafficFlowMap, {
  type NodeType,
  type SecurityCheckpoint,
  type ServiceNode,
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
  return (
    <TrafficFlowMap
      systemName={systemName}
      architectureOverride={architecture}
      titleOverride="Egress Flow Map"
      pathBadgeOverride={`Path → ${path.dataStore.name}`}
      innerTitleOverride="Egress flow"
      innerSubtitleOverride="Observed read access + open network channel for this workload → data path"
      observedMode
    />
  )
}

// ---------------------------------------------------------------------------
// DataLeakPath → SystemArchitecture
// ---------------------------------------------------------------------------

function buildArchitecture(path: DataLeakPath): SystemArchitecture {
  const w = path.workload
  const store = path.dataStore
  const dests = path.networkPlane.internetDestinations
  const observed = path.dataPlane.observedApiCalls
  const totalEvents = observed._state === "wired" ? observed.totalEvents ?? 0 : 0
  const totalBytes = observed._state === "wired" ? observed.totalBytes ?? 0 : 0

  const computeServices: ServiceNode[] = [
    {
      id: w.id,
      name: w.name,
      shortName: w.name,
      type: workloadNodeType(w.type),
      instanceId: w.id,
    },
  ]

  // Resources lane: data store (with crown-jewel marker — that's the
  // value at risk) plus each observed internet destination as its own
  // node. Operators see the destinations on the right alongside the
  // data store, both rendered with the same ServiceNodeBox treatment.
  const resources: ServiceNode[] = [
    {
      id: store.id,
      name: store.name,
      shortName: shortenStoreName(store.name),
      type: storeNodeType(store.type),
      isCrownJewel: true,
    },
  ]
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
          // The renderer hides the Gaps badge in observedMode, but we
          // still flag the public-egress posture so any future viewer
          // surfacing has the signal.
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

  // IAM role IS in the egress visualization — in egress terms it's
  // the workload's identity, the thing that authenticates the read.
  // Same node either way; the operator reads it as "this role has
  // read access to the data store".
  const iamRoles: SecurityCheckpoint[] = w.iamRole.id
    ? [
        {
          id: w.iamRole.id,
          type: "iam_role",
          name: w.iamRole.name || w.iamRole.id,
          shortName: w.iamRole.name || w.iamRole.id,
          usedCount: observed.actions?.length || 0,
          totalCount: observed.actions?.length || 0,
          gapCount: 0,
          connectedSources: [w.id],
          connectedTargets: [store.id],
        },
      ]
    : []

  // Flows:
  //   1. workload → data store: real CloudTrail / S3-access-log totals
  //   2. workload → each observed internet destination: VPC Flow Log bytes/hits
  // ConnectionLinesSVG draws curves through the SG/NACL/role checkpoints;
  // we set sgId/naclId/roleId on flows where they apply.
  const sgId = w.securityGroup.id ?? undefined
  const naclId = w.nacl?.id ?? undefined
  const roleId = w.iamRole.id ?? undefined
  const flows: TrafficFlow[] = []
  flows.push({
    sourceId: w.id,
    targetId: store.id,
    sgId,
    naclId,
    roleId,
    ports: [],
    protocol: "https",
    bytes: totalBytes,
    connections: totalEvents,
    isActive: totalEvents > 0,
  })
  if (dests._state === "wired") {
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

function storeNodeType(type: string): NodeType {
  const t = type.toLowerCase()
  if (t.includes("s3") || t.includes("bucket")) return "storage"
  if (t.includes("dynamo")) return "dynamodb"
  if (t.includes("rds") || t.includes("aurora") || t.includes("redshift")) return "database"
  if (t.includes("kms") || t.includes("secret")) return "storage"
  return "storage"
}

function destNodeType(kind?: string | null): NodeType {
  if (kind === "aws") return "api_gateway"
  return "internet"
}

function shortenStoreName(name: string): string {
  if (name.length <= 24) return name
  return name.slice(0, 22) + "…"
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
