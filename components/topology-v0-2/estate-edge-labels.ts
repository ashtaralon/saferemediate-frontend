/**
 * Estate Map edge-label grammar — keep observed/config/system cases distinct.
 * Corridor bundling collapses Glance ALL ACCESS IGW/VPCE ribbon piles.
 */

import type { TrafficEdge, TrafficEdgeClass } from "./types"

/** Flow-Log public-IP exposure on a DB engine port (not "N systems"). */
export function databasePublicIpExposureLabel(
  externalSources: number,
  port: number | null | undefined,
): string | null {
  if (!externalSources || externalSources <= 0) return null
  const n = Math.floor(externalSources)
  const ipWord = n === 1 ? "public IP" : "public IPs"
  if (port != null) return `${n} ${ipWord} on :${port}`
  return `${n} ${ipWord} on RDS`
}

/** Visual corridor for rail-bound overlay badges (not DB exposure). */
export type CorridorKind = "egress" | "s3_via_igw" | "aws_api_via_igw" | "vpce"

export function corridorKindForEdge(
  e: Pick<
    TrafficEdge,
    | "target_id"
    | "edge_class"
    | "via_igw"
    | "egress_path"
    | "via_vpce_id"
    | "is_exposed"
    | "egress_breakdown"
    | "protocol"
  >,
  opts: { routedViaIgw?: boolean; routedViaVpce?: boolean } = {},
): CorridorKind | null {
  // Loud risk lede — never corridor-bundle with egress noise.
  if (e.edge_class === "database" && e.is_exposed) return null
  if (e.edge_class === "database") return null

  const cls = (e.edge_class ?? "internal") as TrafficEdgeClass
  if (cls === "egress" || e.target_id === "__igw__") return "egress"
  if (cls === "vpce" || e.via_vpce_id || opts.routedViaVpce) return "vpce"

  if (cls === "edge_service") {
    const viaPublic =
      opts.routedViaIgw ||
      e.via_igw === true ||
      e.egress_path === "public" ||
      e.target_id === "__aws_s3__" ||
      e.target_id === "__aws_api__"
    if (!viaPublic && e.egress_path !== "vpce" && !e.via_vpce_id) {
      // Direct edge_service without IGW/VPCE hop — leave unbundled.
      return null
    }
    if (e.egress_path === "vpce" || e.via_vpce_id || opts.routedViaVpce) return "vpce"
    const isS3 =
      e.target_id === "__aws_s3__" ||
      (e.egress_breakdown ?? []).some(b => b.kind === "s3") ||
      (e.protocol ?? "").includes("S3")
    if (isS3) return "s3_via_igw"
    if (e.target_id === "__aws_api__") return "aws_api_via_igw"
    // Other AWS-via-IGW (ACTUAL_TRAFFIC style) → treat as API corridor.
    if (viaPublic) return "aws_api_via_igw"
  }
  return null
}

export interface CorridorBadgeMember {
  label: string
  externalDestinations?: number | null
}

export interface BundledCorridorBadge {
  label: string
  title: string
}

/** One chip copy for a corridor group; title keeps full per-edge strings. */
export function bundleCorridorBadge(
  kind: CorridorKind,
  members: CorridorBadgeMember[],
): BundledCorridorBadge {
  const n = members.length
  const title = members.map(m => m.label).filter(Boolean).join("\n")
  if (n <= 1) {
    return { label: members[0]?.label ?? "", title: members[0]?.label ?? "" }
  }
  if (kind === "egress") {
    return { label: `Egress · ${n} flows`, title }
  }
  if (kind === "vpce") {
    return { label: `VPCE · ${n} flows`, title }
  }
  if (kind === "s3_via_igw") {
    const endpoints = members.reduce(
      (sum, m) => sum + (typeof m.externalDestinations === "number" ? m.externalDestinations : 0),
      0,
    )
    const label = endpoints > 0
      ? `S3 · ${endpoints} endpoints · via IGW`
      : `S3 · ${n} flows · via IGW`
    return { label, title }
  }
  // aws_api_via_igw
  return { label: `AWS API · ${n} flows · via IGW`, title }
}

/**
 * Collapse corridor badges in place. Returns which path indices keep a visible
 * badge. Glance: bundle whenever a corridor has 2+ members. Inventory: only
 * when a corridor has more than 2 badges (noise threshold).
 */
export function selectBundledCorridorBadges(
  items: Array<{
    kind: CorridorKind | null
    label: string
    externalDestinations?: number | null
    badgeX: number
    badgeY: number
  }>,
  mode: "glance" | "inventory",
): Array<{ index: number; label: string; title: string } | null> {
  const out: Array<{ index: number; label: string; title: string } | null> = items.map(() => null)
  const byKind = new Map<CorridorKind, number[]>()
  items.forEach((it, i) => {
    if (!it.kind || !it.label) return
    const arr = byKind.get(it.kind) ?? []
    arr.push(i)
    byKind.set(it.kind, arr)
  })
  for (const [kind, idxs] of byKind) {
    const threshold = mode === "glance" ? 2 : 3
    if (idxs.length < threshold) {
      for (const i of idxs) {
        out[i] = { index: i, label: items[i].label, title: items[i].label }
      }
      continue
    }
    const members = idxs.map(i => ({
      label: items[i].label,
      externalDestinations: items[i].externalDestinations,
    }))
    const bundled = bundleCorridorBadge(kind, members)
    // Prefer the badge closest to the rail (rightmost), then mid-Y.
    let best = idxs[0]
    for (const i of idxs) {
      const cur = items[i]
      const bestIt = items[best]
      if (cur.badgeX > bestIt.badgeX + 4) best = i
      else if (Math.abs(cur.badgeX - bestIt.badgeX) <= 4 && cur.badgeY < bestIt.badgeY) best = i
    }
    for (const i of idxs) {
      out[i] = i === best
        ? { index: i, label: bundled.label, title: bundled.title }
        : null
    }
  }
  // Non-corridor items keep their own label.
  items.forEach((it, i) => {
    if (it.kind) return
    if (!it.label) return
    out[i] = { index: i, label: it.label, title: it.label }
  })
  return out
}
