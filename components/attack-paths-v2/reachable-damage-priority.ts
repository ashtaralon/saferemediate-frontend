/**
 * Reachable Damage Priority + Zoom 0 row contract (PRD-attacker-lens-three-zoom).
 *
 * Pure + deterministic. Observed vs config stay separate axes — never blended
 * into a single risk score. Network on IAM-only paths is N/A, never fake green.
 */

import type {
  IdentityAttackPath,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"
import { classifyPathShape } from "./path-shape"

/** Operator-facing layer chip (Permissions / Network / Data). */
export type LayerEvidence =
  | "observed"
  | "config-open"
  | "closed"
  | "unknown"
  | "na-standing"

export type ReachableDamageBucket =
  | "observed_destructive"
  | "observed_exfil_read"
  | "config_destructive"
  | "config_exfil_read"
  | "standing_iam_only"

/** Lower rank = higher triage priority (1 = fix first). */
export const REACHABLE_DAMAGE_RANK: Record<ReachableDamageBucket, number> = {
  observed_destructive: 1,
  observed_exfil_read: 2,
  config_destructive: 3,
  config_exfil_read: 4,
  standing_iam_only: 5,
}

export interface PathLayerChips {
  permissions: LayerEvidence
  network: LayerEvidence
  data: LayerEvidence
}

export interface Zoom0PathProjection {
  attacker_headline: string
  layers: PathLayerChips
  damage_verbs: string[]
  lateral_count: number
  reachable_damage_bucket: ReachableDamageBucket
  reachable_damage_rank: number
  fix_ready: boolean
}

function normGate(raw: string | null | undefined): LayerEvidence {
  const g = (raw || "").toUpperCase()
  if (g.includes("OBSERVED") || g === "OPEN_OBSERVED") return "observed"
  if (g.includes("CLOSED") || g === "BLOCKED") return "closed"
  if (g.includes("CONFIG") || g === "OPEN_CONFIG" || g === "POTENTIAL_EXCESS") {
    return "config-open"
  }
  if (!g || g === "UNKNOWN" || g === "UNVERIFIED") return "unknown"
  return "unknown"
}

function hasObservedDataPlane(path: IdentityAttackPath): boolean {
  return (path.edges ?? []).some(
    (e) =>
      e.is_observed === true &&
      /ACTUAL_S3_ACCESS|READS_FROM|WRITES_TO|ACCESSES_RESOURCE/i.test(e.type),
  )
}

function hasAnyObserved(path: IdentityAttackPath): boolean {
  if (path.evidence_type === "observed") return true
  return (path.edges ?? []).some((e) => e.is_observed === true)
}

/** Derive P/N/D from materialized gates when present; else honest IAP signals. */
export function compilePathLayers(path: IdentityAttackPath): PathLayerChips {
  const mp = path.materialized_path
  const shape = classifyPathShape(path)
  const standing = shape.kind === "B" || shape.kind === "C"

  let permissions: LayerEvidence
  let network: LayerEvidence
  let data: LayerEvidence

  if (mp) {
    permissions = normGate(mp.identity_gate)
    network = normGate(mp.route_gate)
    data = normGate(mp.data_plane_gate)
  } else {
    permissions = hasAnyObserved(path) ? "observed" : "config-open"
    network = "config-open"
    data = hasObservedDataPlane(path)
      ? "observed"
      : hasAnyObserved(path)
        ? "config-open"
        : "config-open"
  }

  // Never fake green: IAM-only / standing access → Network N/A when no real OPEN/CLOSED.
  if (standing) {
    const routeRaw = mp?.route_gate
    const routeNorm = routeRaw ? normGate(routeRaw) : "unknown"
    if (!mp || routeNorm === "unknown") {
      network = "na-standing"
    }
  }

  return { permissions, network, data }
}

function damageVerbsFromPath(path: IdentityAttackPath): string[] {
  const fromMat = path.damage_capability?.materialized_damage_types
  const types =
    (fromMat && fromMat.length > 0
      ? fromMat
      : path.materialized_path?.damage_types) ??
    path.damage_types ??
    []
  const order = ["admin", "delete", "exfiltrate", "write", "read", "encrypt", "corrupt"]
  const set = new Set(types.map((t) => t.toLowerCase()))
  const out: string[] = []
  for (const o of order) {
    if (set.has(o)) out.push(o === "exfiltrate" ? "EXFIL" : o.toUpperCase())
  }
  // Also map impact buckets when damage_types empty
  if (out.length === 0 && path.impact_buckets?.length) {
    for (const b of path.impact_buckets) {
      if (b === "DESTRUCTIVE") out.push("DELETE")
      else if (b === "EXFIL") out.push("EXFIL")
      else if (b === "READ" || b === "WRITE") out.push(b)
    }
  }
  return out
}

function isDestructive(verbs: string[], path: IdentityAttackPath): boolean {
  if (verbs.some((v) => /DELETE|ADMIN|DESTROY|DESTRUCTIVE/i.test(v))) return true
  const buckets = path.impact_buckets ?? []
  return buckets.some((b) => b === "DESTRUCTIVE" || b === "PRIV_ESC")
}

function isExfilOrRead(verbs: string[], path: IdentityAttackPath): boolean {
  if (verbs.some((v) => /EXFIL|READ|WRITE/i.test(v))) return true
  const buckets = path.impact_buckets ?? []
  return buckets.some((b) => b === "EXFIL" || b === "READ" || b === "WRITE")
}

export function classifyReachableDamageBucket(
  path: IdentityAttackPath,
  layers: PathLayerChips,
  verbs: string[],
): ReachableDamageBucket {
  if (layers.network === "na-standing") return "standing_iam_only"

  const observed =
    layers.permissions === "observed" ||
    layers.data === "observed" ||
    layers.network === "observed" ||
    hasAnyObserved(path)

  if (observed && isDestructive(verbs, path)) return "observed_destructive"
  if (observed && isExfilOrRead(verbs, path)) return "observed_exfil_read"
  if (!observed && isDestructive(verbs, path)) return "config_destructive"
  if (!observed && isExfilOrRead(verbs, path)) return "config_exfil_read"
  return "standing_iam_only"
}

function damagePhrase(bucket: ReachableDamageBucket, verbs: string[]): string {
  if (bucket === "standing_iam_only") return "IAM-only path"
  if (
    bucket === "observed_destructive" ||
    bucket === "config_destructive" ||
    verbs.some((v) => /DELETE|ADMIN/i.test(v))
  ) {
    return "destructive path"
  }
  if (verbs.some((v) => /EXFIL/i.test(v)) || bucket.includes("exfil")) {
    return "exfil path"
  }
  if (verbs.some((v) => /READ|WRITE/i.test(v))) return "read path"
  return "access path"
}

/** Headline sentence first — never a badge pile (PRD FR4). */
export function compileAttackerHeadline(
  path: IdentityAttackPath,
  jewel: CrownJewelSummary | null,
  layers: PathLayerChips,
  bucket: ReachableDamageBucket,
  verbs: string[],
): string {
  const jewelName =
    jewel?.name ??
    path.nodes?.find((n) => n.tier === "crown_jewel")?.name ??
    "crown jewel"
  const via =
    path.materialized_path?.role_name ||
    path.damage_capability?.role_name ||
    path.nodes?.find((n) => /IAMRole/i.test(n.type))?.name

  if (bucket === "standing_iam_only" || layers.network === "na-standing") {
    const base = `Standing access — IAM-only path to ${jewelName}`
    return via ? `${base} via ${via}` : base
  }

  const conf =
    layers.permissions === "observed" ||
    layers.data === "observed" ||
    layers.network === "observed" ||
    hasAnyObserved(path)
      ? "Observed"
      : "Config-only"

  const kind = damagePhrase(bucket, verbs)
  const base = `${conf} ${kind} to ${jewelName}`
  return via ? `${base} via ${via}` : base
}

export function compileZoom0Projection(
  path: IdentityAttackPath,
  jewel: CrownJewelSummary | null,
): Zoom0PathProjection {
  const layers = compilePathLayers(path)
  const damage_verbs = damageVerbsFromPath(path)
  const reachable_damage_bucket = classifyReachableDamageBucket(
    path,
    layers,
    damage_verbs,
  )
  const lateral_count = Math.max(
    0,
    path.damage_capability?.lateral_action_count ?? 0,
  )
  const fix_ready = Boolean(
    path.risk_reduction?.top_actions?.[0]?.action ||
      (path.risk_reduction?.reduction_summary &&
        path.risk_reduction.reduction_summary.length > 0),
  )

  return {
    attacker_headline: compileAttackerHeadline(
      path,
      jewel,
      layers,
      reachable_damage_bucket,
      damage_verbs,
    ),
    layers,
    damage_verbs,
    lateral_count,
    reachable_damage_bucket,
    reachable_damage_rank: REACHABLE_DAMAGE_RANK[reachable_damage_bucket],
    fix_ready,
  }
}

/** Sort comparator: Reachable Damage Priority, then lateral, then fix readiness. */
export function compareReachableDamagePriority(
  a: {
    reachable_damage_rank: number
    lateral_count: number
    fix_ready: boolean
    observed_hits?: number
    hop_count?: number
  },
  b: {
    reachable_damage_rank: number
    lateral_count: number
    fix_ready: boolean
    observed_hits?: number
    hop_count?: number
  },
): number {
  if (a.reachable_damage_rank !== b.reachable_damage_rank) {
    return a.reachable_damage_rank - b.reachable_damage_rank
  }
  if (b.lateral_count !== a.lateral_count) return b.lateral_count - a.lateral_count
  if (Number(b.fix_ready) !== Number(a.fix_ready)) {
    return Number(b.fix_ready) - Number(a.fix_ready)
  }
  const ha = a.observed_hits ?? 0
  const hb = b.observed_hits ?? 0
  if (hb !== ha) return hb - ha
  return (a.hop_count ?? 0) - (b.hop_count ?? 0)
}

export function layerChipLabel(layer: "P" | "N" | "D", evidence: LayerEvidence): string {
  const prefix = layer === "P" ? "P" : layer === "N" ? "N" : "D"
  if (evidence === "na-standing") return `${prefix}: N/A — standing access`
  if (evidence === "observed") return `${prefix}: observed`
  if (evidence === "config-open") return `${prefix}: config-open`
  if (evidence === "closed") return `${prefix}: closed`
  return `${prefix}: unknown`
}
