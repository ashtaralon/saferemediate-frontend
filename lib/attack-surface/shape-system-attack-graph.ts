/**
 * Pure shaping: IAP jewels + paths → account-wide attack graph model.
 * Extracted from attack-explorer.tsx so Explorer + Surface share one contract.
 */

import type { CrownJewelSummary, IdentityAttackPath, PathNodeDetail } from "@/components/identity-attack-paths/types"
import type { TopoWorkload, TopologyResponse } from "@/components/attack-paths-v2/containment-model"
import type {
  AggregatedAttackEdge,
  AttackGraphSelection,
  RiskBand,
  SystemAttackGraph,
  SystemFoothold,
  SystemJewelNode,
  SystemPathEdge,
} from "./system-attack-graph-types"

export const RISK_BAND_COLORS: Record<RiskBand, string> = {
  CRITICAL: "#ff4d61",
  HIGH: "#ff9b3d",
  MEDIUM: "#ffd24d",
  LOW: "#46c7c0",
  UNKNOWN: "#8195b1",
}

export function bandOf(severity?: string | null): RiskBand {
  const u = (severity || "").toUpperCase()
  if (u === "CRITICAL" || u === "HIGH" || u === "MEDIUM" || u === "LOW") return u as RiskBand
  return "UNKNOWN"
}

export function footholdOfPath(p: IdentityAttackPath): { name: string; type: string } {
  const ns = (p.nodes ?? []) as PathNodeDetail[]
  const c =
    ns.find((n) => /ec2|instance|lambda|ecs|fargate|compute/i.test(n.type || "")) ||
    ns.find((n) => n.tier === "entry") ||
    ns[0]
  return { name: c?.name || "unknown", type: c?.type || "EC2Instance" }
}

function indexWorkloadsByName(topology: TopologyResponse | null | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>()
  if (!topology) return out
  for (const vpc of topology.vpcs ?? []) {
    for (const az of vpc.azs ?? []) {
      for (const subnet of az.subnets ?? []) {
        for (const w of subnet.workloads ?? []) {
          const key = (w.name || w.id).toLowerCase()
          const arr = out.get(key) ?? []
          arr.push(w.id)
          out.set(key, arr)
        }
      }
    }
  }
  return out
}

export function shapeSystemAttackGraph(
  systemName: string,
  jewels: CrownJewelSummary[],
  paths: IdentityAttackPath[],
  topology?: TopologyResponse | null,
): SystemAttackGraph {
  const jewelById = new Map(jewels.map((j) => [j.id, j]))
  const workloadByName = indexWorkloadsByName(topology)
  const pathEdges: SystemPathEdge[] = []

  for (const p of paths) {
    const f = footholdOfPath(p)
    const sev = p.severity as { overall_score?: number; severity?: string } | undefined
    pathEdges.push({
      footKey: f.name,
      footType: f.type,
      jewelId: p.crown_jewel_id,
      score: sev?.overall_score ?? 0,
      band: bandOf(sev?.severity),
      evidence: p.evidence_type || "configured",
      pathId: p.id,
      damage: (p.damage_types as string[]) ?? [],
      hops: p.hop_count ?? (p.nodes?.length ?? 0),
      path: p,
    })
  }

  const footholdAcc = new Map<string, SystemFoothold>()
  const jewelAcc = new Map<string, SystemJewelNode>()

  for (const e of pathEdges) {
    const f =
      footholdAcc.get(e.footKey) ||
      ({
        key: e.footKey,
        name: e.footKey,
        type: e.footType,
        maxScore: 0,
        band: "LOW" as RiskBand,
        pathCount: 0,
        workloadIds: workloadByName.get(e.footKey.toLowerCase()) ?? [],
      } satisfies SystemFoothold)
    if (e.score >= f.maxScore) {
      f.maxScore = e.score
      f.band = e.band
    }
    f.pathCount++
    footholdAcc.set(e.footKey, f)

    const jw = jewelById.get(e.jewelId)
    const j =
      jewelAcc.get(e.jewelId) ||
      ({
        id: e.jewelId,
        name: jw?.name || e.jewelId,
        type: jw?.type || "S3Bucket",
        maxScore: 0,
        band: "LOW" as RiskBand,
        pathCount: 0,
      } satisfies SystemJewelNode)
    if (e.score >= j.maxScore) {
      j.maxScore = e.score
      j.band = e.band
    }
    j.pathCount++
    jewelAcc.set(e.jewelId, j)
  }

  const footholds = [...footholdAcc.values()].sort((a, b) => b.maxScore - a.maxScore)
  const jewelNodes = [...jewelAcc.values()].sort((a, b) => b.maxScore - a.maxScore)

  const aggregatedEdges = aggregatePathEdges(pathEdges)

  const pathsById = new Map(paths.map((p) => [p.id, p]))
  const jewelsById = new Map(jewelNodes.map((j) => [j.id, j]))
  const footholdsByKey = new Map(footholds.map((f) => [f.key, f]))

  return {
    systemName,
    jewels: jewelNodes,
    footholds,
    pathEdges,
    aggregatedEdges,
    byId: {
      paths: pathsById,
      jewels: jewelsById,
      footholds: footholdsByKey,
    },
  }
}

export function aggregatePathEdges(pathEdges: SystemPathEdge[]): AggregatedAttackEdge[] {
  const m = new Map<string, AggregatedAttackEdge>()
  for (const e of pathEdges) {
    const key = `${e.footKey}||${e.jewelId}`
    const g =
      m.get(key) ||
      ({
        key,
        footKey: e.footKey,
        jewelId: e.jewelId,
        band: "LOW" as RiskBand,
        maxScore: 0,
        observed: false,
        pathIds: [],
      } satisfies AggregatedAttackEdge)
    if (e.score >= g.maxScore) {
      g.maxScore = e.score
      g.band = e.band
    }
    g.observed = g.observed || e.evidence === "observed"
    g.pathIds.push(e.pathId)
    m.set(key, g)
  }
  return [...m.values()]
}

export function isAggregatedEdgeHot(
  edge: Pick<AggregatedAttackEdge, "footKey" | "jewelId">,
  selection: AttackGraphSelection,
): boolean {
  if (!selection) return true
  if (selection.kind === "foot") return edge.footKey === selection.key
  if (selection.kind === "jewel") return edge.jewelId === selection.key
  if (selection.kind === "edge") return selection.key === `${edge.footKey}||${edge.jewelId}`
  return true
}

export function isNodeHot(
  kind: "foot" | "jewel",
  key: string,
  selection: AttackGraphSelection,
  aggregatedEdges: AggregatedAttackEdge[],
): boolean {
  if (!selection) return true
  if (selection.kind === kind && selection.key === key) return true
  return aggregatedEdges.some(
    (e) =>
      isAggregatedEdgeHot(e, selection) &&
      (kind === "foot" ? e.footKey === key : e.jewelId === key),
  )
}

export function pathsForSelection(
  graph: SystemAttackGraph,
  selection: AttackGraphSelection,
): SystemPathEdge[] {
  if (!selection) return [...graph.pathEdges].sort((a, b) => b.score - a.score)
  let edges = graph.pathEdges
  if (selection.kind === "foot") edges = edges.filter((e) => e.footKey === selection.key)
  else if (selection.kind === "jewel") edges = edges.filter((e) => e.jewelId === selection.key)
  else if (selection.kind === "edge") {
    const [f, j] = selection.key.split("||")
    edges = edges.filter((e) => e.footKey === f && e.jewelId === j)
  }
  return edges.sort((a, b) => b.score - a.score)
}

export function matchWorkload(
  foothold: SystemFoothold,
  workloads: TopoWorkload[],
): TopoWorkload | undefined {
  const byName = workloads.find((w) => w.name === foothold.name || w.id === foothold.name)
  if (byName) return byName
  if (foothold.workloadIds.length === 1) {
    return workloads.find((w) => w.id === foothold.workloadIds[0])
  }
  return undefined
}
