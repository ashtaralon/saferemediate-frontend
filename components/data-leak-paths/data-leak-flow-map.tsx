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

  // resources holds the data store + each observed internet destination
  // as separate nodes. Renders them in the RESOURCES lane on the right.
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
          gapCount: w.securityGroup.hasPublicEgress ? 1 : 0,
          connectedSources: [w.id],
          connectedTargets: [store.id, ...resources.slice(1).map((r) => r.id)],
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
          connectedTargets: [store.id, ...resources.slice(1).map((r) => r.id)],
        },
      ]
    : []

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

  // Flows: one workload → data store flow with real observed events/bytes,
  // plus one workload → destination flow per destination card (with that
  // destination's observed bytes/hits).
  // TrafficFlow accepts `string | undefined` for these — coalesce nulls.
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

  const totalBytesSum = flows.reduce((s, f) => s + (f.bytes || 0), 0)
  const totalConnectionsSum = flows.reduce((s, f) => s + (f.connections || 0), 0)
  const totalGapsSum =
    (securityGroups[0]?.gapCount || 0) + (iamRoles[0]?.gapCount || 0)

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
    totalGaps: totalGapsSum,
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
