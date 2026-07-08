/**
 * Architecture layout model for Estate Map (Platform / SRE / IT).
 *
 * Derives business-system structure from inventory placement
 * (tiers, ingress, regional services) — not Terraform intent, not observed
 * traffic, and not attack paths. Those belong to Traffic Map and Risk.
 *
 * Pure / environment-agnostic: any system with the topology-risk contract.
 */
import type { TopologyNode, VpcTopology } from "./types"

/** Minimal frame shape — avoids importing aws-frame (circular). */
export interface ArchitectureFrameInput {
  vid: string | null
  isForeign: boolean
  ownerSystem: string | null
  natGws: { id: string; name: string }[]
  grid: {
    albNodes: TopologyNode[]
    azs: string[]
    byAzAndTier: Map<string, Map<"web" | "app" | "data" | "unknown", TopologyNode[]>>
    subnetsByCell: Map<string, { id: string }[]>
  }
}

export type ArchitectureHopKind =
  | "internet"
  | "ingress"
  | "web"
  | "app"
  | "data"
  | "regional"
  | "vpc_boundary"

export interface ArchitectureHop {
  kind: ArchitectureHopKind
  /** Short label for the strip (e.g. "Web Tier", "ALB"). */
  label: string
  /** Optional detail under the label (workload name, VPC id, service types). */
  detail: string | null
  /** Representative node ids for this hop (for handoffs / dimmed edges). */
  nodeIds: string[]
}

export interface SystemArchitecturePath {
  systemName: string
  /** Human-readable one-liner: Internet → ALB → Web → App → Data → Regional */
  summary: string
  hops: ArchitectureHop[]
  vpcSummary: string
  hasSharedVpc: boolean
  hasAlb: boolean
  hasNat: boolean
  hasDataTier: boolean
  hasRegional: boolean
}

const ALB_TYPES = new Set(["LoadBalancer", "ALB", "ApplicationLoadBalancer"])
const REGIONAL_TYPES = new Set([
  "S3", "S3Bucket",
  "KMSKey",
  "DynamoDB", "DynamoDBTable",
  "Secret", "SecretsManagerSecret",
])
const SERVERLESS_TYPES = new Set(["Lambda", "LambdaFunction"])

function shortId(id: string, max = 12): string {
  return id.length > max ? `${id.slice(0, max - 1)}…` : id
}

function shortName(name: string | null | undefined, fallback: string): string {
  if (!name) return fallback
  return name.length > 28 ? `${name.slice(0, 27)}…` : name
}

function tierWorkloads(frame: ArchitectureFrameInput, tier: "web" | "app" | "data"): TopologyNode[] {
  const out: TopologyNode[] = []
  for (const azMap of frame.grid.byAzAndTier.values()) {
    out.push(...(azMap.get(tier) ?? []))
  }
  return out
}

function frameHasTier(frame: ArchitectureFrameInput, tier: "web" | "app" | "data"): boolean {
  for (const az of frame.grid.azs) {
    const sn = frame.grid.subnetsByCell.get(`${az}::${tier}`) ?? []
    const wl = frame.grid.byAzAndTier.get(az)?.get(tier) ?? []
    if (sn.length > 0 || wl.length > 0) return true
  }
  return false
}

function pickRepresentatives(nodes: TopologyNode[], limit = 2): TopologyNode[] {
  const scored = [...nodes].sort((a, b) => {
    const ar = a.score?.rank ?? 999
    const br = b.score?.rank ?? 999
    if (ar !== br) return ar - br
    return (a.name ?? a.id).localeCompare(b.name ?? b.id)
  })
  return scored.slice(0, limit)
}

function typeLabel(n: TopologyNode): string {
  if (!n.type) return "workload"
  if (ALB_TYPES.has(n.type)) return "ALB"
  if (n.type === "EC2" || n.type === "EC2Instance") return "EC2"
  if (SERVERLESS_TYPES.has(n.type)) return "Lambda"
  if (n.type === "RDS" || n.type === "RDSInstance") return "RDS"
  return n.type
}

/**
 * Build the intended architecture path for a business system from placement
 * data already on the estate canvas (frames + optional regional/serverless).
 */
export function buildSystemArchitecturePath(opts: {
  systemName: string
  frames: ArchitectureFrameInput[]
  vpcTopology?: VpcTopology | null
  regionalNodes?: TopologyNode[]
  serverlessNodes?: TopologyNode[]
}): SystemArchitecturePath {
  const { systemName, frames, vpcTopology, regionalNodes = [], serverlessNodes = [] } = opts
  const hops: ArchitectureHop[] = []

  hops.push({
    kind: "internet",
    label: "Internet",
    detail: vpcTopology?.edges?.igws?.[0]
      ? `IGW · ${shortName(vpcTopology.edges.igws[0].name, "present")}`
      : null,
    nodeIds: [],
  })

  const albNodes = frames.flatMap(f => f.grid.albNodes)
  const natCount = frames.reduce((n, f) => n + f.natGws.length, 0)
  if (albNodes.length > 0) {
    const reps = pickRepresentatives(albNodes, 2)
    hops.push({
      kind: "ingress",
      label: albNodes.length === 1 ? "ALB" : `ALB ×${albNodes.length}`,
      detail: reps.map(n => shortName(n.name, n.id)).join(" · "),
      nodeIds: albNodes.map(n => n.id),
    })
  } else if (natCount > 0) {
    hops.push({
      kind: "ingress",
      label: natCount === 1 ? "NAT" : `NAT ×${natCount}`,
      detail: "Egress / private path",
      nodeIds: [],
    })
  } else {
    hops.push({
      kind: "ingress",
      label: "Public entry",
      detail: "No ALB observed",
      nodeIds: [],
    })
  }

  const tierMeta: { tier: "web" | "app" | "data"; label: string; kind: ArchitectureHopKind }[] = [
    { tier: "web", label: "Web Tier", kind: "web" },
    { tier: "app", label: "App Tier", kind: "app" },
    { tier: "data", label: "Data Tier", kind: "data" },
  ]
  for (const { tier, label, kind } of tierMeta) {
    const present = frames.some(f => frameHasTier(f, tier))
    // Data always appears when frames exist — empty is still structure.
    if (!present && tier !== "data") continue
    if (!present && tier === "data" && frames.length === 0) continue
    const all = frames.flatMap(f => tierWorkloads(f, tier))
    const reps = pickRepresentatives(all, 2)
    const detail =
      all.length === 0
        ? tier === "data"
          ? "No data subnet / DB workload observed"
          : null
        : `${all.length} · ${reps.map(n => `${typeLabel(n)} ${shortName(n.name, n.id)}`).join(", ")}`
    hops.push({
      kind,
      label,
      detail,
      nodeIds: all.map(n => n.id),
    })
  }

  const regional = regionalNodes.filter(n => n.type && REGIONAL_TYPES.has(n.type))
  const serverless = serverlessNodes.filter(n => n.type && SERVERLESS_TYPES.has(n.type))
  const outside = [...regional, ...serverless]
  if (outside.length > 0) {
    const byType = new Map<string, number>()
    for (const n of outside) {
      const t = typeLabel(n)
      byType.set(t, (byType.get(t) ?? 0) + 1)
    }
    const typeBits = [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([t, c]) => `${t}×${c}`)
      .join(" · ")
    hops.push({
      kind: "regional",
      label: "Regional / outside VPC",
      detail: typeBits,
      nodeIds: outside.map(n => n.id),
    })
  }

  const shared = frames.filter(f => f.isForeign)
  const own = frames.length - shared.length
  const vpcSummary =
    frames.length === 0
      ? "No VPC frames"
      : shared.length > 0
        ? `${own} own VPC${own === 1 ? "" : "s"} · ${shared.length} shared (${shared
            .map(s => s.ownerSystem ?? shortId(s.vid ?? "vpc"))
            .join(", ")})`
        : `${frames.length} VPC${frames.length === 1 ? "" : "s"}`

  const summaryHops = hops.map(h => h.label)
  const summary = `${systemName} · ${summaryHops.join(" → ")} · ${vpcSummary}`

  return {
    systemName,
    summary,
    hops,
    vpcSummary,
    hasSharedVpc: shared.length > 0,
    hasAlb: albNodes.length > 0,
    hasNat: natCount > 0,
    hasDataTier: frames.some(f => frameHasTier(f, "data")),
    hasRegional: outside.length > 0,
  }
}

/** Compact hop chain for chrome (no system name). */
export function formatArchitecturePathStrip(path: SystemArchitecturePath): string {
  return path.hops.map(h => h.label).join(" → ")
}
