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
 *   - Default / spotlight: pin → that path only; no pin → every path.
 *   - Fan-in (`fetchAll`): every summary path_id always; pin only
 *     reorders (pin first) so the dossier settles before siblings.
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

export type PathIdsNeedingDetailOptions = {
  /**
   * Fan-in honesty: always every summary path. Pin (when present) is
   * moved to the front for pin-first fetch ordering — it does not
   * shrink the set.
   */
  fetchAll?: boolean
}

/** Put the pinned path_id first when it is in the set. */
export function prioritizePinnedPathId(
  ids: string[],
  pinnedPathId?: string | null,
): string[] {
  const pin = (pinnedPathId ?? "").trim()
  if (!pin) return [...ids]
  const rest = ids.filter((id) => id !== pin)
  if (rest.length === ids.length) return [...ids]
  return [pin, ...rest]
}

/** Collect unique summary path_ids in summary order. */
export function allSummaryPathIds(
  summary: CrownJewelConvergenceSummary | null | undefined,
): string[] {
  if (!summary?.paths?.length) return []
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

/** Which summary paths need a /detail hop fetch for the current view. */
export function pathIdsNeedingDetail(
  summary: CrownJewelConvergenceSummary | null | undefined,
  pinnedPathId?: string | null,
  options?: PathIdsNeedingDetailOptions,
): string[] {
  const all = allSummaryPathIds(summary)
  if (all.length === 0) return []
  const pin = (pinnedPathId ?? "").trim()
  if (options?.fetchAll) {
    return prioritizePinnedPathId(all, pin)
  }
  if (pin) {
    const hit = all.find((id) => id === pin)
    return hit ? [hit] : [pin]
  }
  return all
}

/**
 * True when a failed /detail should be retried (cold / flap), not when
 * the path is genuinely missing or the request was malformed.
 */
export function isRetryableDetailFailure(
  status: number | null | undefined,
  errorMessage?: string | null,
): boolean {
  if (status === 404 || status === 422 || status === 400) return false
  if (status != null && (status >= 500 || status === 408 || status === 429)) {
    return true
  }
  const m = (errorMessage || "").toLowerCase()
  if (!m) return status == null
  return (
    m.includes("abort") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("network") ||
    m.includes("failed to fetch") ||
    m.includes("backend") ||
    m.includes("502") ||
    m.includes("503") ||
    m.includes("504")
  )
}

export type FetchConvergenceDetailResult =
  | { ok: true; path: ConvergencePath }
  | { ok: false; error: string; status?: number }

const DEFAULT_DETAIL_TIMEOUT_MS = 30_000
const DEFAULT_DETAIL_MAX_ATTEMPTS = 3
const DEFAULT_DETAIL_RETRY_DELAYS_MS = [2000, 5000]

/**
 * Fetch one /by-crown-jewel/detail with short aborts + cold retries.
 * Outer `signal` cancels the whole attempt chain (effect cleanup).
 */
export async function fetchConvergencePathDetail(params: {
  url: string
  timeoutMs?: number
  maxAttempts?: number
  retryDelaysMs?: number[]
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}): Promise<FetchConvergenceDetailResult> {
  const timeoutMs = params.timeoutMs ?? DEFAULT_DETAIL_TIMEOUT_MS
  const maxAttempts = params.maxAttempts ?? DEFAULT_DETAIL_MAX_ATTEMPTS
  const delays = params.retryDelaysMs ?? DEFAULT_DETAIL_RETRY_DELAYS_MS
  const fetchImpl = params.fetchImpl ?? fetch
  const sleep =
    params.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  let lastError = "detail fetch failed"
  let lastStatus: number | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (params.signal?.aborted) {
      return { ok: false, error: "detail cancelled", status: lastStatus }
    }
    const ctrl = new AbortController()
    const onOuterAbort = () => ctrl.abort(params.signal?.reason)
    params.signal?.addEventListener("abort", onOuterAbort)
    const timer = setTimeout(
      () =>
        ctrl.abort(
          new DOMException("Backend slow — retrying detail…", "TimeoutError"),
        ),
      timeoutMs,
    )
    try {
      const res = await fetchImpl(params.url, {
        cache: "no-store",
        signal: ctrl.signal,
      })
      const body = (await res.json().catch(() => null)) as
        | { path?: ConvergencePath; error?: string }
        | null
      if (res.ok && body?.path) {
        return { ok: true, path: body.path }
      }
      lastStatus = res.status
      lastError = body?.error ?? `detail ${res.status}`
      if (!isRetryableDetailFailure(res.status, lastError)) {
        return { ok: false, error: lastError, status: res.status }
      }
    } catch (e) {
      lastError = (e as Error).message ?? "detail fetch failed"
      lastStatus = undefined
      if (!isRetryableDetailFailure(null, lastError)) {
        return { ok: false, error: lastError }
      }
    } finally {
      clearTimeout(timer)
      params.signal?.removeEventListener("abort", onOuterAbort)
    }

    if (attempt < maxAttempts) {
      const delay = delays[Math.min(attempt - 1, delays.length - 1)] ?? 2000
      try {
        await sleep(delay)
      } catch {
        /* ignore */
      }
    }
  }

  return { ok: false, error: lastError, status: lastStatus }
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
      route_verdict: p.route_verdict ?? null,
      // ACQUISITION — who can take this principal once already INSIDE the
      // account (distinct from initial_access, which is how they got in).
      //
      // `base` is a field-by-field REBUILD, not a spread: anything not named
      // here is dropped even though it arrived on the summary. This is the
      // fifth whitelist boundary this one field had to cross, and every miss
      // looked identical from outside — correct in the graph, correct on the
      // API, correct in the browser payload, and invisible in the UI. When
      // adding a ConvergencePath field, grep for every place that constructs
      // one rather than trusting a spread that isn't there.
      acquisition: p.acquisition ?? null,
      // VPC-attachment SSOT for Attack Map honesty banner (#469 / BE #632).
      // Without this, verified-non-vpc never reaches path-authority TFM.
      workload_network: p.workload_network ?? null,
      // A1/O1 from (:AttackPath) — must survive summary→merge or Zoom0
      // hardcodes UNVERIFIED over real graph state.
      authz_decision: p.authz_decision ?? null,
      authz_technique_id: p.authz_technique_id ?? null,
      authz_verdict: p.authz_verdict ?? null,
      live_traffic_promoted: Boolean(p.live_traffic_promoted),
      path_bound_observations: p.path_bound_observations ?? [],
      feasibility: p.feasibility ?? null,
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
      // Keep server route verdict on the pinned path — dossier needs it.
      route_verdict: detail.route_verdict ?? base.route_verdict ?? null,
      workload_network:
        detail.workload_network ?? base.workload_network ?? null,
      authz_decision: detail.authz_decision ?? base.authz_decision ?? null,
      authz_technique_id:
        detail.authz_technique_id ?? base.authz_technique_id ?? null,
      authz_verdict: detail.authz_verdict ?? base.authz_verdict ?? null,
      live_traffic_promoted: Boolean(
        detail.live_traffic_promoted ?? base.live_traffic_promoted,
      ),
      path_bound_observations:
        detail.path_bound_observations ?? base.path_bound_observations ?? [],
      feasibility: detail.feasibility ?? base.feasibility ?? null,
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
    // SERVE N-of-M envelope — must survive detail merge or Zoom0 lies.
    cardinality: summary.cardinality ?? null,
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
