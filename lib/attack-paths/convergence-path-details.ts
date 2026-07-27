/**
 * Crown-jewel convergence path-detail model.
 *
 * Summary endpoints intentionally omit hops for speed. The path-layer
 * canvas (Zoom0 Reachability / path-authority) requires hop DTOs for
 * every drawn path — otherwise a Lambda-only detail fetch makes a
 * multi-path fan-in look like "IAM is the only gate" while an EC2
 * sibling path still has subnet/SG/NACL/IGW in Neo4j.
 *
 * Contract:
 *   - Fan-in (no path pin): detail-fetch EVERY summary path_id.
 *   - Single-path pin: detail-fetch that path only.
 *   - Until a path's detail settles, hops must not be treated as an
 *     authoritative empty network spine.
 */

import type {
  ConvergencePath,
  CrownJewelConvergence,
  CrownJewelConvergenceSummary,
} from "@/lib/attack-paths/convergence-types"

export type PathDetailLoadState = "pending" | "ready" | "error"

export interface PathDetailRecord {
  state: PathDetailLoadState
  path?: ConvergencePath
  error?: string
}

/** Which summary paths need a /detail hop fetch for the current view. */
export function pathIdsNeedingDetail(
  summary: CrownJewelConvergenceSummary | null | undefined,
  pinnedPathId?: string | null,
): string[] {
  if (!summary?.paths?.length) return []
  const pin = (pinnedPathId ?? "").trim()
  if (pin) {
    const hit = summary.paths.find((p) => p.path_id === pin)
    return hit?.path_id ? [hit.path_id] : [pin]
  }
  // Fan-in / union: every path in the summary envelope — including
  // identity-only rows — so the model never silently drops hop topology.
  const ids: string[] = []
  const seen = new Set<string>()
  for (const p of summary.paths) {
    const id = (p.path_id ?? "").trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

export function detailsReadyFor(
  neededIds: string[],
  byId: Record<string, PathDetailRecord>,
): boolean {
  if (neededIds.length === 0) return true
  return neededIds.every((id) => {
    const rec = byId[id]
    return rec?.state === "ready" || rec?.state === "error"
  })
}

export function detailsLoadingFor(
  neededIds: string[],
  byId: Record<string, PathDetailRecord>,
): boolean {
  if (neededIds.length === 0) return false
  return neededIds.some((id) => {
    const rec = byId[id]
    return !rec || rec.state === "pending"
  })
}

/** Paths whose /detail fetch settled as error (for honesty banners). */
export function detailFailuresFor(
  neededIds: string[],
  byId: Record<string, PathDetailRecord>,
): Array<{ pathId: string; error?: string }> {
  const out: Array<{ pathId: string; error?: string }> = []
  for (const id of neededIds) {
    const rec = byId[id]
    if (rec?.state === "error") {
      out.push({ pathId: id, error: rec.error })
    }
  }
  return out
}

/**
 * Merge summary path rows with settled detail records.
 * Paths still pending keep hops=[] but are stamped hops_load_state=pending
 * so consumers can refuse to invent "no network" from absence.
 */
export function mergeSummaryWithPathDetails(
  summary: CrownJewelConvergenceSummary,
  detailsByPathId: Record<string, PathDetailRecord>,
): CrownJewelConvergence {
  const paths: ConvergencePath[] = summary.paths.map((p) => {
    const evidence = p.evidence ?? p.confidence
    const base: ConvergencePath = {
      path_id: p.path_id,
      source: p.source,
      source_kind: p.source_kind,
      workload_arn: p.workload_arn,
      identity: p.identity,
      identity_name: p.identity_name,
      damage: p.damage,
      score: p.score,
      severity: p.severity,
      severity_label: p.severity_label,
      evidence,
      confidence: evidence,
      identity_gate: p.identity_gate,
      route_gate: p.route_gate,
      data_plane_gate: p.data_plane_gate,
      path_status: p.path_status,
      hop_count: p.hop_count,
      routes_via: [],
      role_assumption_observed: false,
      cj_target_id: summary.cj_arn ?? summary.cj_name ?? null,
      hops: [],
      hops_load_state: "pending",
      initial_access: [],
      impact_headline: p.impact_headline,
      business_sentence: p.business_sentence,
      closure_recommendation: p.closure_recommendation,
      computed_at: p.computed_at,
      schema_version: p.schema_version,
    }

    const rec = detailsByPathId[p.path_id]
    if (!rec || rec.state === "pending") {
      return base
    }
    if (rec.state === "error" || !rec.path) {
      return {
        ...base,
        hops_load_state: "error",
      }
    }

    const detail = rec.path
    const detailEvidence = detail.evidence ?? detail.confidence ?? evidence
    return {
      ...base,
      evidence: detailEvidence,
      confidence: detailEvidence,
      identity_gate: detail.identity_gate ?? base.identity_gate,
      route_gate: detail.route_gate ?? base.route_gate,
      data_plane_gate: detail.data_plane_gate ?? base.data_plane_gate,
      path_status: detail.path_status ?? base.path_status,
      routes_via: detail.routes_via ?? [],
      role_assumption_observed: detail.role_assumption_observed ?? false,
      cj_target_id: detail.cj_target_id ?? base.cj_target_id,
      hops: detail.hops ?? [],
      hops_load_state: "ready",
      initial_access: detail.initial_access ?? [],
      impact_headline: detail.impact_headline ?? base.impact_headline,
      business_sentence: detail.business_sentence ?? base.business_sentence,
      closure_recommendation:
        detail.closure_recommendation ?? base.closure_recommendation,
      severity_label: detail.severity_label ?? base.severity_label,
      computed_at: detail.computed_at ?? base.computed_at,
      schema_version: detail.schema_version ?? base.schema_version,
      hop_count: detail.hop_count ?? base.hop_count,
    }
  })

  return {
    system: summary.system,
    cj_arn: summary.cj_arn,
    cj_name: summary.cj_name,
    cj_type: summary.cj_type,
    paths_total: summary.paths_total,
    observed_paths: summary.observed_paths,
    choke_points: summary.choke_points,
    paths,
    risk_summary: summary.risk_summary ?? null,
    serve_state: summary.serve_state,
    coverage_state: summary.coverage_state,
    generation: summary.generation,
    as_of: summary.as_of,
  }
}

/** Run async work over ids with a small concurrency cap. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const limit = Math.max(1, Math.min(concurrency, items.length))
  const results: R[] = new Array(items.length)
  let next = 0

  async function runOne(): Promise<void> {
    while (next < items.length) {
      const i = next
      next += 1
      results[i] = await worker(items[i])
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runOne()))
  return results
}

/**
 * Paths whose hop arrays are authoritative for path-layer rendering.
 * Excludes pending (summary-only) rows — empty hops there mean "not
 * loaded", not "IAM-only / no network".
 */
export function pathsWithAuthoritativeHops(
  paths: ConvergencePath[],
): ConvergencePath[] {
  return paths.filter((p) => {
    const state = p.hops_load_state
    if (state === "pending") return false
    if (state === "error") return false
    if (state === "fallback") return false
    // ready, or legacy rows without the stamp
    return true
  })
}
