import type {
  ConvergencePath,
  PathCardinality,
} from "@/lib/attack-paths/convergence-types"

export type FanInOmissionReason =
  | "identity_only"
  | "detail_pending"
  | "detail_failed"
  | "non_authoritative"
  | "no_renderable_edge"

export interface FanInPathDisposition {
  path: ConvergencePath
  drawable: boolean
  reason: FanInOmissionReason | null
}

export interface FanInDrawabilitySummary {
  drawnPaths: ConvergencePath[]
  drawnCount: number
  omittedCount: number
  omittedPathIds: string[]
  omittedByReason: Partial<Record<FanInOmissionReason, number>>
}

const OMISSION_LABELS: Record<FanInOmissionReason, string> = {
  identity_only: "identity-only",
  detail_pending: "details pending",
  detail_failed: "detail failed",
  non_authoritative: "non-authoritative",
  no_renderable_edge: "no renderable edge",
}

/**
 * Model-layer fan-in placement contract.
 *
 * An identity-only path remains eligible and pinnable, but the unpinned
 * compute-led fan-in does not place it. Ready DTOs must also contain at
 * least one typed relationship; otherwise cards could be placed without an
 * authoritative chain connecting them.
 *
 * Legacy unstamped paths remain drawable when they have a workload so older
 * callers do not regress while the detail contract rolls out.
 */
export function fanInPathDisposition(
  path: ConvergencePath,
): FanInPathDisposition {
  const state = path.hops_load_state
  if (state === "pending") {
    return { path, drawable: false, reason: "detail_pending" }
  }
  if (state === "error") {
    return { path, drawable: false, reason: "detail_failed" }
  }
  if (state === "fallback") {
    return { path, drawable: false, reason: "non_authoritative" }
  }
  if (!(path.workload_arn ?? "").trim()) {
    return { path, drawable: false, reason: "identity_only" }
  }
  if (
    state === "ready" &&
    !(path.hops ?? []).some((hop) => Boolean(hop.edge_type_from_prev?.trim()))
  ) {
    return { path, drawable: false, reason: "no_renderable_edge" }
  }
  return { path, drawable: true, reason: null }
}

export function summarizeFanInDrawability(
  paths: ConvergencePath[],
): FanInDrawabilitySummary {
  const dispositions = paths.map(fanInPathDisposition)
  const drawnPaths = dispositions
    .filter((item) => item.drawable)
    .map((item) => item.path)
  const omitted = dispositions.filter(
    (item): item is FanInPathDisposition & { reason: FanInOmissionReason } =>
      !item.drawable && item.reason != null,
  )
  const omittedByReason: FanInDrawabilitySummary["omittedByReason"] = {}
  for (const item of omitted) {
    omittedByReason[item.reason] = (omittedByReason[item.reason] ?? 0) + 1
  }
  return {
    drawnPaths,
    drawnCount: drawnPaths.length,
    omittedCount: omitted.length,
    omittedPathIds: omitted.map((item) => item.path.path_id),
    omittedByReason,
  }
}

export function formatFanInOmissionReasons(
  reasons: FanInDrawabilitySummary["omittedByReason"],
): string {
  return (Object.entries(reasons) as Array<[FanInOmissionReason, number]>)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${count} ${OMISSION_LABELS[reason]}`)
    .join(", ")
}

/**
 * Honest cardinality chrome. "Omitted" means returned by SERVE but not
 * placed on the unpinned fan-in; it is distinct from eligible-but-not-returned
 * truncation and generation-level exclusions.
 */
export function formatFanInCardinality(
  cardinality: PathCardinality,
  drawability: FanInDrawabilitySummary,
): string {
  const drawn =
    typeof cardinality.drawn_count === "number"
      ? cardinality.drawn_count
      : drawability.drawnCount
  const omitted = Math.max(cardinality.returned_count - drawn, 0)
  const reasonText = formatFanInOmissionReasons(drawability.omittedByReason)
  const parts = [
    `${cardinality.eligible_total} eligible`,
    `${cardinality.returned_count} returned`,
    `${drawn} drawn`,
    `${omitted} omitted${reasonText ? ` (${reasonText})` : ""}`,
    `${cardinality.generation_total} in generation`,
  ]
  const notReturned = Math.max(
    cardinality.eligible_total - cardinality.returned_count,
    0,
  )
  if (notReturned > 0) parts.push(`${notReturned} not returned`)
  const excluded = Object.values(
    cardinality.excluded_count_by_reason ?? {},
  ).reduce((sum, count) => sum + Math.max(0, count), 0)
  if (excluded > 0) parts.push(`${excluded} generation-excluded`)
  if (cardinality.truncated) parts.push("truncated")
  return parts.join(" · ")
}
