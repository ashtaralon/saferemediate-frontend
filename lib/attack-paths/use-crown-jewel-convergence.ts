"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CrownJewelSummary, IdentityAttackPath } from "@/components/identity-attack-paths/types"
import {
  buildConvergenceDetailUrl,
  buildConvergenceSummaryUrl,
} from "./convergence-fetch-url"
import {
  detailFailuresFor,
  detailsLoadingFor,
  detailsReadyFor,
  fetchConvergencePathDetail,
  mapPool,
  mergeSummaryWithPathDetails,
  pathIdsNeedingDetail,
  type PathDetailRecord,
} from "./convergence-path-details"
import { readConvergencePaths } from "./convergence-readiness"
import { matchConvergencePathId } from "./iap-to-convergence"
import { iapHold } from "./path-evidence-view"
import { semanticHoldMessage, type SemanticHoldKind } from "@/lib/semantic-hold"
import type {
  CrownJewelConvergence,
  CrownJewelConvergenceSummary,
} from "./convergence-types"

/**
 * AP201 (M4): an answer that settles the question. A TYPED hold / refusal is an answer, not a cold backend, and a 4xx
 * (other than 408 / 429) is final. Neither is retried; the message names the hold (V3-PERF-06/07).
 *
 * Not settled: the legacy `{error}` wrapper (`iapHold` kind "error"). The summary proxy itself answers 5xx and its
 * own timeout with `{error: "Failed to … crown jewel summary"}`, so that wrapper is a cold backend and keeps the
 * AP188 ladder. Today that proxy rewrites EVERY backend non-2xx into that wrapper, so the typed refused / route-held
 * / 503-unavailable arms below are reached only by a 200 body (or once the proxy forwards typed bodies); they are
 * kept so a forwarded typed answer is read as one rather than as "backend may be cold".
 */
class SettledAnswer extends Error {}
const SETTLED_HOLD_KINDS: ReadonlySet<SemanticHoldKind> = new Set(["not_recorded", "unavailable", "refused", "route_held"])

interface UseCrownJewelConvergenceResult {
  data: CrownJewelConvergence | null
  loading: boolean
  /** True while summary auto-retry is scheduled / in flight. */
  retrying: boolean
  /** True while one or more required path /detail fetches are unsettled. */
  detailsLoading: boolean
  /** True when every required path detail has settled (ready or error). */
  detailsReady: boolean
  /** Paths whose hop /detail fetch failed — never silent on the map. */
  detailFailures: Array<{ pathId: string; error?: string }>
  /** How many summary attempts have been made for this jewel (1-based). */
  attempts: number
  error: string | null
  /** AP201 (M4): the server settled the question (typed hold / refusal, or a final 4xx). `error` names it; there
   *  will be no auto-retry, so a caller must not keep "warming" on `attempts`. */
  settled: boolean
  retry: () => void
}

export type UseCrownJewelConvergenceOptions = {
  /**
   * Fan-in honesty: detail-fetch EVERY summary path even when a pin is
   * set. Pin only reorders (pin first) so the dossier settles before
   * siblings. Without this, a pin shrinks the set to one path_id.
   */
  fanInAllDetails?: boolean
}

const MAX_AUTO_RETRIES = 4
const RETRY_DELAYS_MS = [3000, 6000, 10000, 15000]
/**
 * Sibling /detail concurrency after the pin settles. Keep low so a cold
 * Render worker is not flooded (fan-in used to fire 4×55s aborts at once).
 */
const DETAIL_SIBLING_CONCURRENCY = 2

const AUTHORITATIVE_ZERO_TARGET_STATES = new Set([
  "no_modeled_route",
  "coverage_incomplete",
  "projection_not_ready",
])

/**
 * The target catalog is the authority for zero-path jewels. Asking the
 * path-summary endpoint for one of these targets can only return NOT_READY:
 * the materialized path snapshot intentionally contains paths, not zero rows.
 * Treat the catalog's explicit zero as settled so the UI does not retry a
 * known-empty summary and leave the operator looking at a warming spinner.
 */
export function hasAuthoritativeZeroPaths(
  jewel: CrownJewelSummary | null,
): boolean {
  return Boolean(
    jewel &&
      Number(jewel.path_count ?? 0) === 0 &&
      AUTHORITATIVE_ZERO_TARGET_STATES.has(jewel.target_state ?? ""),
  )
}

/** Summary first (fast strip) + hop detail for every path in the model.
 *
 * Fan-in (`fanInAllDetails`) detail-fetches ALL summary path_ids so the
 * path-authority canvas never paints a Lambda-only spine over an EC2
 * sibling that still has subnet/SG/NACL hops in Neo4j. The pin (when set)
 * is fetched first; siblings follow at low concurrency with cold retries.
 *
 * Cold Render workers often return nothing for 55s+ on first hit. We auto-
 * retry the summary a few times instead of surfacing a hard HTTP 502 after
 * one abort — operators were getting bricked by a single cold miss. Detail
 * uses the same idea with shorter per-attempt aborts.
 */
export function useCrownJewelConvergence(
  systemName: string | null,
  jewel: CrownJewelSummary | null,
  selectedPathId: string | null = null,
  iapPaths: IdentityAttackPath[] = [],
  options: UseCrownJewelConvergenceOptions = {},
): UseCrownJewelConvergenceResult {
  const fanInAllDetails = Boolean(options.fanInAllDetails)
  const [summary, setSummary] = useState<CrownJewelConvergenceSummary | null>(null)
  const [detailsByPathId, setDetailsByPathId] = useState<
    Record<string, PathDetailRecord>
  >({})
  const [loading, setLoading] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [settled, setSettled] = useState(false)
  const [nonce, setNonce] = useState(0)
  const attemptRef = useRef(0)
  /** Path ids whose /detail already settled ready — skip re-fetch on pin change. */
  const readyDetailIdsRef = useRef<Set<string>>(new Set())

  const retry = useCallback(() => {
    attemptRef.current = 0
    setAttempts(0)
    setNonce((n) => n + 1)
  }, [])

  // Phase 1: summary with auto-retry on cold timeout / 5xx.
  useEffect(() => {
    if (!systemName || !jewel || hasAuthoritativeZeroPaths(jewel)) {
      setSummary(null)
      setDetailsByPathId({})
      readyDetailIdsRef.current = new Set()
      setError(null)
      setSettled(false)
      setLoading(false)
      setRetrying(false)
      setAttempts(0)
      attemptRef.current = 0
      return
    }

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    attemptRef.current = 0
    setAttempts(0)
    setLoading(true)
    setRetrying(false)
    setError(null)
    setSettled(false)
    setDetailsByPathId({})
    readyDetailIdsRef.current = new Set()
    setSummary(null)

    const summaryUrl = buildConvergenceSummaryUrl(systemName, jewel)

    const runAttempt = async () => {
      if (cancelled) return
      attemptRef.current += 1
      const attempt = attemptRef.current
      setAttempts(attempt)
      setLoading(true)
      setRetrying(attempt > 1)
      setError(null)

      const ctrl = new AbortController()
      const timer = setTimeout(
        () =>
          ctrl.abort(
            new DOMException("Backend warming up — retrying…", "TimeoutError"),
          ),
        55_000,
      )

      try {
        const summaryRes = await fetch(summaryUrl, { signal: ctrl.signal })
        const summaryBody = (await summaryRes.json().catch(() => null)) as
          | CrownJewelConvergenceSummary
          | { error?: string }
          | null
        if (cancelled) return
        const hold = summaryBody && typeof summaryBody === "object" ? iapHold(summaryBody) : null
        // "unavailable" is two producers: the 200 semantic hold (settled, as use-cached-fetch fail-closes it) and the
        // typed 503 reader failure (transient there: 503 is retried). Only the 200 form settles here.
        const settledHold =
          hold != null && SETTLED_HOLD_KINDS.has(hold.kind) && (hold.kind !== "unavailable" || summaryRes.ok)
        if (settledHold) throw new SettledAnswer(semanticHoldMessage(hold))
        if (!summaryRes.ok || !summaryBody || "error" in summaryBody) {
          const msg =
            (summaryBody as { error?: string })?.error ??
            `Backend busy (${summaryRes.status})`
          const finalStatus =
            summaryRes.status >= 400 && summaryRes.status < 500 && summaryRes.status !== 408 && summaryRes.status !== 429
          if (finalStatus) {
            // The server's own words when it gave any; never "Backend busy" for an answer that is final.
            const detail = (summaryBody as { detail?: unknown })?.detail
            throw new SettledAnswer(
              (summaryBody as { error?: string })?.error ??
                (typeof detail === "string" && detail ? detail : `HTTP ${summaryRes.status}`),
            )
          }
          throw new Error(msg)
        }
        // AP188: a 200 hold (semantic_status not_recorded / unavailable), a typed refusal, or a body with no path
        // list is not a summary. It goes the failure way, never "a summary with no paths" (which also made
        // mergeSummaryWithPathDetails throw on the missing list).
        const reading = readConvergencePaths(summaryBody)
        if (reading.kind === "unavailable") {
          throw new Error(reading.reason ?? "Attack-path summary unavailable")
        }
        // AP189: a NOT_READY answer is kept as one -- its state is what every reader shows ("unknown, not absent") --
        // and a pathless one gets an empty list, so no caller maps a missing list. It is never read as a zero.
        const body = summaryBody as CrownJewelConvergenceSummary
        setSummary(Array.isArray(body.paths) ? body : { ...body, paths: [] })
        setError(null)
        setRetrying(false)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        if (e instanceof SettledAnswer) {
          setSummary(null)
          setError(e.message)
          setSettled(true)
          setRetrying(false)
          setLoading(false)
          return
        }
        const m = (e as Error).message ?? String(e)
        const friendly =
          m.includes("aborted") || m.includes("Timeout")
            ? "Backend warming up — retrying…"
            : m.startsWith("HTTP") || m.startsWith("http_")
              ? "Backend busy — retrying…"
              : m
        if (attempt <= MAX_AUTO_RETRIES) {
          setError(friendly)
          setRetrying(true)
          setLoading(false)
          const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]
          retryTimer = setTimeout(() => {
            void runAttempt()
          }, delay)
          return
        }
        setSummary(null)
        setError(
          "Couldn’t reach path data after several tries — backend may be cold. Hit Retry.",
        )
        setRetrying(false)
        setLoading(false)
      } finally {
        clearTimeout(timer)
      }
    }

    void runAttempt()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [
    systemName,
    jewel?.id,
    jewel?.canonical_id,
    jewel?.name,
    jewel?.path_count,
    jewel?.target_state,
    nonce,
  ])

  const resolvedSelectedPathId = useMemo(
    () => (summary ? matchConvergencePathId(summary.paths, selectedPathId, iapPaths) : null),
    [summary, selectedPathId, iapPaths],
  )

  const neededDetailIds = useMemo(
    () =>
      pathIdsNeedingDetail(summary, resolvedSelectedPathId, {
        fetchAll: fanInAllDetails,
      }),
    [summary, resolvedSelectedPathId, fanInAllDetails],
  )

  // Phase 2: hop detail — pin first (when present), then siblings @2 with retries.
  useEffect(() => {
    if (!systemName || !jewel || !summary) return
    if (neededDetailIds.length === 0) return

    const ctrl = new AbortController()

    // Mark required ids pending; keep already-ready rows across pin changes.
    setDetailsByPathId((prev) => {
      const next: Record<string, PathDetailRecord> = { ...prev }
      for (const id of neededDetailIds) {
        const existing = prev[id]
        if (existing?.state === "ready" && existing.path) {
          next[id] = existing
          readyDetailIdsRef.current.add(id)
        } else {
          next[id] = { state: "pending" }
        }
      }
      return next
    })

    const applyResult = (
      pathId: string,
      result: Awaited<ReturnType<typeof fetchConvergencePathDetail>>,
    ) => {
      if (ctrl.signal.aborted) return
      if (result.ok) {
        readyDetailIdsRef.current.add(pathId)
        setDetailsByPathId((prev) => ({
          ...prev,
          [pathId]: { state: "ready", path: result.path },
        }))
      } else {
        setDetailsByPathId((prev) => ({
          ...prev,
          [pathId]: { state: "error", error: result.error },
        }))
      }
    }

    const fetchOne = async (pathId: string) => {
      if (ctrl.signal.aborted) return pathId
      if (readyDetailIdsRef.current.has(pathId)) return pathId

      const detailUrl = buildConvergenceDetailUrl(systemName, jewel, pathId)
      const result = await fetchConvergencePathDetail({
        url: detailUrl,
        signal: ctrl.signal,
      })
      applyResult(pathId, result)
      return pathId
    }

    const run = async () => {
      const [first, ...rest] = neededDetailIds
      // Pin-first (or first summary path): settle dossier before flooding.
      if (first) await fetchOne(first)
      if (ctrl.signal.aborted || rest.length === 0) return
      await mapPool(rest, DETAIL_SIBLING_CONCURRENCY, fetchOne)
    }

    void run()

    return () => {
      ctrl.abort()
    }
  }, [
    systemName,
    jewel?.id,
    jewel?.canonical_id,
    jewel?.name,
    resolvedSelectedPathId,
    summary,
    neededDetailIds.join("|"),
    nonce,
    fanInAllDetails,
  ])

  const data =
    summary != null ? mergeSummaryWithPathDetails(summary, detailsByPathId) : null

  const detailsReady = detailsReadyFor(neededDetailIds, detailsByPathId)
  const detailsLoading = detailsLoadingFor(neededDetailIds, detailsByPathId)
  const detailFailures = useMemo(
    () => detailFailuresFor(neededDetailIds, detailsByPathId),
    [neededDetailIds, detailsByPathId],
  )

  return {
    data,
    loading,
    retrying,
    detailsLoading,
    detailsReady,
    detailFailures,
    attempts,
    error,
    settled,
    retry,
  }
}

/** Minimal jewel for callers that only have arn/name (convergence-map-loader). Nothing is known about it beyond the
 *  name: no severity, no score, no exposure (AP201 I3: it used to invent MEDIUM / 0 / false). */
export function crownJewelFromArnName(
  cjArn: string | null,
  cjName: string | null,
): CrownJewelSummary | null {
  if (!cjArn && !cjName) return null
  const id = cjArn || cjName || ""
  return {
    id,
    canonical_id: cjArn,
    name: cjName || cjArn || id,
    type: "Unknown",
    severity: null,
    path_count: 0,
    highest_risk_score: null,
    is_internet_exposed: null,
    data_classification: null,
    priority_score: 0,
  }
}
