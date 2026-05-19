"use client"

// useMitigationExecution — per-mitigation state machine that owns the
// Simulate → Stage → Full execution sequence for one path/mitigation
// pair on the Data Leak Paths page.
//
// State machine:
//   idle ──► simulating ──► simulated ──► staging ──► staged ──► applying ──► done
//             │                  │                       │                       │
//             └──► error ◄───────┴──► error ◄────────────┴──► error  (any failure)
//
// Promotion rules per design decision (2026-05-19):
//   - Stage button enabled only after a successful Simulate.
//   - Full button enabled only after a successful Stage.
//   - Operator MUST click each step manually — no auto-promotion.
//   - Re-running Simulate from any state is allowed (reset).
//
// Override lineage:
//   When the mitigation has `requiresOverrideLineage: true`, Full
//   apply MUST be wrapped in a force=true + override_lineage payload
//   per Decision Contract §7 (CLAUDE.md). The hook accepts the
//   assembled lineage object from OverrideModalShared and merges it
//   into the request body verbatim.

import { useCallback, useRef, useState } from "react"
import type {
  DataLeakMitigation,
  DataLeakMitigationExecutionEndpoint,
} from "@/lib/types"
import type { OverrideLineagePayload } from "@/components/override-modal-shared"

export type MitigationStage = "simulate" | "stage" | "full"

export type MitigationPhase =
  | "idle"
  | "simulating"
  | "simulated"
  | "staging"
  | "staged"
  | "applying"
  | "done"
  | "error"

export interface MitigationStageResult {
  stage: MitigationStage
  ok: boolean
  status: number
  // Backend response body, parsed as JSON. Shape varies per endpoint;
  // the UI renders summary fields that are present and ignores the rest.
  body: Record<string, unknown> | null
  // Best-effort short label for the inline result panel.
  summary: string
  // ISO timestamp of when this result was captured.
  capturedAt: string
}

export interface MitigationExecutionState {
  phase: MitigationPhase
  simulate: MitigationStageResult | null
  stage: MitigationStageResult | null
  full: MitigationStageResult | null
  error: string | null
}

const INITIAL: MitigationExecutionState = {
  phase: "idle",
  simulate: null,
  stage: null,
  full: null,
  error: null,
}

interface RunArgs {
  stage: MitigationStage
  /** Override lineage payload from OverrideModalShared. Required when
   *  the mitigation declares `requiresOverrideLineage: true` AND the
   *  caller is invoking `full`. */
  overrideLineage?: OverrideLineagePayload
}

export interface UseMitigationExecutionResult {
  state: MitigationExecutionState
  /** Whether the operator can click the given stage right now. */
  canRun: (stage: MitigationStage) => boolean
  /** Execute one stage. Returns the captured result. */
  run: (args: RunArgs) => Promise<MitigationStageResult | null>
  /** Reset the state machine back to idle (forgets all results). */
  reset: () => void
}

export function useMitigationExecution(
  mitigation: DataLeakMitigation,
): UseMitigationExecutionResult {
  const [state, setState] = useState<MitigationExecutionState>(INITIAL)
  // Track an in-flight fetch so we can avoid double-submits without
  // disabling the button (which would lose state during a re-render).
  const inflightRef = useRef<MitigationStage | null>(null)

  const canRun = useCallback(
    (s: MitigationStage): boolean => {
      if (!mitigation.applicable) return false
      const ex = mitigation.execution
      if (!ex) return false
      if (state.phase === "simulating" || state.phase === "staging" || state.phase === "applying") {
        return false
      }
      if (s === "simulate") return !!ex.simulate
      if (s === "stage")    return !!ex.stage && state.simulate?.ok === true
      if (s === "full") {
        if (!ex.full) return false
        // When the mitigation has no native canary stage (SG, IAM):
        // Full activates after a successful Simulate. When there IS a
        // stage (VPCE): Full activates after a successful Stage.
        if (ex.stage) return state.stage?.ok === true
        return state.simulate?.ok === true
      }
      return false
    },
    [mitigation, state],
  )

  const run = useCallback(
    async ({ stage, overrideLineage }: RunArgs): Promise<MitigationStageResult | null> => {
      if (inflightRef.current) return null
      const ex = mitigation.execution
      if (!ex) return null
      const endpoint = ex[stage] as DataLeakMitigationExecutionEndpoint | undefined
      if (!endpoint) return null

      inflightRef.current = stage
      const inflightPhase: MitigationPhase =
        stage === "simulate" ? "simulating" :
        stage === "stage"    ? "staging"    :
                               "applying"

      setState((s) => ({ ...s, phase: inflightPhase, error: null }))

      // Compose the request body. The backend already authored the
      // canonical body in `execution.{stage}.body`; we POST that
      // verbatim, merging force=true + override_lineage when this is
      // a Full apply with an override.
      let body = endpoint.body ?? {}
      if (stage === "full" && overrideLineage) {
        body = { ...body, force: true, override_lineage: overrideLineage }
      }

      let result: MitigationStageResult
      try {
        const proxyPath = ensureProxyPath(endpoint.path)
        const res = await fetch(proxyPath, {
          method: endpoint.method || "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        let parsed: Record<string, unknown> | null = null
        try {
          parsed = (await res.json()) as Record<string, unknown>
        } catch {
          parsed = null
        }
        result = {
          stage,
          ok: res.ok,
          status: res.status,
          body: parsed,
          summary: summarizeResult(stage, res.ok, res.status, parsed),
          capturedAt: new Date().toISOString(),
        }
      } catch (err) {
        result = {
          stage,
          ok: false,
          status: 0,
          body: null,
          summary: `Network error: ${err instanceof Error ? err.message : "unknown"}`,
          capturedAt: new Date().toISOString(),
        }
      } finally {
        inflightRef.current = null
      }

      setState((s) => {
        const next: MitigationExecutionState = {
          ...s,
          [stage]: result,
        }
        if (!result.ok) {
          next.phase = "error"
          next.error = result.summary
          return next
        }
        if (stage === "simulate") next.phase = "simulated"
        if (stage === "stage")    next.phase = "staged"
        if (stage === "full")     next.phase = "done"
        next.error = null
        return next
      })

      return result
    },
    [mitigation],
  )

  const reset = useCallback(() => {
    setState(INITIAL)
    inflightRef.current = null
  }, [])

  return { state, canRun, run, reset }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Ensure the endpoint path is hit through the frontend's /api/proxy/...
 * route so authentication, caching, and BACKEND_URL_OVERRIDE work
 * consistently. Backend authors paths as the bare resource path
 * (e.g. "/api/security-groups/sg-.../remediate") — the proxy layer
 * sits between the browser and Render.
 */
function ensureProxyPath(path: string): string {
  if (path.startsWith("/api/proxy/")) return path
  if (path.startsWith("/api/")) return "/api/proxy/" + path.slice(5)
  return path
}

function summarizeResult(
  stage: MitigationStage,
  ok: boolean,
  status: number,
  body: Record<string, unknown> | null,
): string {
  if (!ok) {
    // FastAPI 422 returns `detail` as an array of validation errors.
    // Surface the first one's msg/loc so the operator sees the actual
    // schema mismatch instead of "[object Object]".
    const detail = body?.detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as Record<string, unknown> | undefined
      const loc = Array.isArray(first?.loc) ? (first.loc as unknown[]).join(".") : "?"
      const msg = (first?.msg as string | undefined) || "validation error"
      return `HTTP ${status}: ${msg} (${loc})`
    }
    const msgCandidate =
      (typeof detail === "string" ? detail : undefined) ||
      (body?.error as string | undefined) ||
      (body?.message as string | undefined)
    return msgCandidate ? `HTTP ${status}: ${truncate(msgCandidate, 200)}` : `HTTP ${status}`
  }

  // Successful response — try a couple of well-known shapes before
  // falling back to a generic confirmation.
  const successMsg = body?.message as string | undefined
  if (successMsg) return truncate(successMsg, 200)

  // SG remediate returns { success, rules_removed, snapshot_id, ... }
  const removed = Array.isArray((body as { rules_removed?: unknown[] })?.rules_removed)
    ? ((body as { rules_removed?: unknown[] }).rules_removed?.length ?? 0)
    : 0
  const snapshotId = (body?.snapshot_id || body?.checkpoint_id) as string | undefined

  // IAM remediate returns { success, permissions_removed, snapshot_id, ... }
  const permsRemoved = Array.isArray((body as { permissions_removed?: unknown[] })?.permissions_removed)
    ? ((body as { permissions_removed?: unknown[] }).permissions_removed?.length ?? 0)
    : 0

  if (stage === "simulate") {
    if (removed > 0)       return `Simulate ok — ${removed} rule${removed === 1 ? "" : "s"} would be removed`
    if (permsRemoved > 0)  return `Simulate ok — ${permsRemoved} permission${permsRemoved === 1 ? "" : "s"} would be removed`
    return "Simulate ok — no changes flagged for AWS yet"
  }
  if (stage === "stage") {
    if (snapshotId) return `Staged on canary scope · snapshot ${snapshotId}`
    return "Staged on canary scope"
  }
  if (stage === "full") {
    if (snapshotId) return `Applied to AWS · rollback snapshot ${snapshotId}`
    return "Applied to AWS"
  }
  return "ok"
}

function truncate(s: string, n: number): string {
  if (!s) return ""
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}
