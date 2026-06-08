// Shared Roles PR-A (2026-05-31) — ReplayVerifyPanel
//
// Surfaces the Layer D Phase 4 replay capability inside the operator
// UI. Reads four fields from (:SimulationRun) — replay_count,
// last_replayed_at, last_verdict, last_replay_id — and renders one
// of seven states:
//
//   resting (data-derived):
//     - never_verified        replay_count = 0
//     - historical_untracked  replay_count > 0 AND last_verdict IS NULL
//                             (pre-PR-A.0 sims; verdict not captured yet)
//     - byte_equivalent       last_verdict = "BYTE_EQUIVALENT"
//     - engine_drift          last_verdict = "ENGINE_DRIFT"   ← amber, self-healing
//     - plan_drift            last_verdict = "PLAN_DRIFT"     ← informational blue
//     - source_missing        last_verdict = "SOURCE_MISSING"  ← subtle red
//
//   transient (UI-local):
//     - verifying             POST in flight
//
// On successful re-verify the parent is asked to refetch
// (onReverified) so the new resting state is data-derived from the
// updated SimulationRun, not held locally. This makes drift state
// self-healing per feedback_amber_must_self_heal — a successful
// BYTE_EQUIVALENT response replaces any prior ENGINE_DRIFT verdict
// on the (:SimulationRun) atomically (PR-A.0), and the next refetch
// reflects that.
"use client"

import { useCallback, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  FilePenLine,
  FileX,
  History,
  Loader2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type {
  ReplayResponse,
  ReplayVerdict,
  SimulationRun,
} from "@/lib/types/atlas-simulate"

// ──────────────────────────────────────────────────────────────────────
// State machine
// ──────────────────────────────────────────────────────────────────────

export type ReplayVerifyState =
  | "never_verified"
  | "historical_untracked"
  | "byte_equivalent"
  | "engine_drift"
  | "plan_drift"
  | "source_missing"
  | "verifying"

/**
 * Derive the resting state from the SimulationRun fields. Exposed
 * for unit testing the state machine independently of render.
 *
 * Inputs:
 *   - replay_count: number  (coalesced to 0 in backend Cypher)
 *   - last_verdict: ReplayVerdict | null
 *
 * Returns the resting state. The transient "verifying" state is
 * UI-local (useState in the component) and never returned here.
 */
export function deriveReplayState(run: {
  replay_count: number
  last_verdict: ReplayVerdict | null
}): Exclude<ReplayVerifyState, "verifying"> {
  if (!run.replay_count || run.replay_count === 0) {
    return "never_verified"
  }
  if (run.last_verdict === null) {
    return "historical_untracked"
  }
  switch (run.last_verdict) {
    case "BYTE_EQUIVALENT":
      return "byte_equivalent"
    case "ENGINE_DRIFT":
      return "engine_drift"
    case "PLAN_DRIFT":
      return "plan_drift"
    case "SOURCE_MISSING":
      return "source_missing"
    default:
      // Unknown verdict from a future backend extension — degrade
      // safely rather than crash. Same shape as historical_untracked
      // operator-side (verdict exists but not yet renderable).
      return "historical_untracked"
  }
}

// ──────────────────────────────────────────────────────────────────────
// Relative time helper
// ──────────────────────────────────────────────────────────────────────

/**
 * Format an ISO timestamp as relative-time-with-ISO-fallback:
 *   < 30 days  → Intl.RelativeTimeFormat ("3 minutes ago", "2 days ago")
 *   ≥ 30 days  → ISO date "2026-04-15"
 *
 * Returns { display, tooltip } where tooltip is always the full ISO
 * so hover discloses the exact timestamp. Exposed for unit testing.
 */
export function formatRelativeOrIso(
  iso: string | null | undefined,
  nowMs: number = Date.now()
): { display: string; tooltip: string } {
  if (!iso) return { display: "—", tooltip: "" }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return { display: "—", tooltip: iso }

  const tooltip = iso // always-full ISO in tooltip
  const diffMs = nowMs - date.getTime()
  const diffSec = Math.round(diffMs / 1000)
  const diffMin = Math.round(diffMs / 60_000)
  const diffHr = Math.round(diffMs / 3_600_000)
  const diffDay = Math.round(diffMs / 86_400_000)

  // > 30 days: fall back to ISO date. Avoids "47 days ago" /
  // "153 days ago" — at that range an exact date is more useful.
  if (diffDay > 30) {
    return { display: date.toISOString().slice(0, 10), tooltip }
  }

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  if (diffDay >= 1) return { display: rtf.format(-diffDay, "day"), tooltip }
  if (diffHr >= 1) return { display: rtf.format(-diffHr, "hour"), tooltip }
  if (diffMin >= 1) return { display: rtf.format(-diffMin, "minute"), tooltip }
  if (diffSec >= 5) return { display: rtf.format(-diffSec, "second"), tooltip }
  return { display: "just now", tooltip }
}

// ──────────────────────────────────────────────────────────────────────
// Per-state visual + copy spec — single source of truth for the
// state matrix. Each entry is the exact copy from the spec the
// product agreed on, plus the icon + tone treatment.
//
// NOTE: descriptive operator copy only — see
// pattern_signal_language_grep_gate in memory for the forbidden
// vocabulary list and waiver mechanism. Enforced by
// scripts/check_signal_language.sh. Engine vocab (ATLAS,
// counterfactual) stays in disclosure layers, never headline.
// ──────────────────────────────────────────────────────────────────────

const STATE_VISUALS: Record<
  Exclude<ReplayVerifyState, "verifying">,
  {
    Icon: typeof CheckCircle2
    iconClass: string
    headerClass: string
    cardClass: string
    cardRingClass: string
  }
> = {
  never_verified: {
    Icon: CircleDashed,
    iconClass: "text-slate-400",
    headerClass: "text-slate-700",
    cardClass: "bg-slate-50",
    cardRingClass: "ring-1 ring-slate-200",
  },
  historical_untracked: {
    Icon: History,
    iconClass: "text-slate-500",
    headerClass: "text-slate-700",
    cardClass: "bg-slate-50",
    cardRingClass: "ring-1 ring-slate-200",
  },
  byte_equivalent: {
    Icon: CheckCircle2,
    iconClass: "text-emerald-500",
    headerClass: "text-emerald-800",
    cardClass: "bg-emerald-50",
    cardRingClass: "ring-1 ring-emerald-200",
  },
  engine_drift: {
    Icon: AlertTriangle,
    iconClass: "text-amber-500",
    headerClass: "text-amber-900",
    cardClass: "bg-amber-50",
    cardRingClass: "ring-1 ring-amber-200",
  },
  plan_drift: {
    Icon: FilePenLine,
    iconClass: "text-sky-500",
    headerClass: "text-sky-900",
    cardClass: "bg-sky-50",
    cardRingClass: "ring-1 ring-sky-200",
  },
  source_missing: {
    Icon: FileX,
    iconClass: "text-rose-400",
    headerClass: "text-rose-800",
    cardClass: "bg-rose-50",
    cardRingClass: "ring-1 ring-rose-200",
  },
}

// ──────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────

export interface ReplayVerifyPanelProps {
  run: SimulationRun
  /** Called when a re-verify request succeeds, so the parent can
   * refetch the SimulationRun and the panel resolves to the new
   * resting state. Drift self-heals on BYTE_EQUIVALENT because the
   * SET clause overwrites unconditionally (PR-A.0 contract). */
  onReverified?: (resp: ReplayResponse) => void
  /** Optional descriptive identity for the (:ReplayEvent) audit node.
   * Free-text; self-attested in v1, not a security boundary. */
  triggeredByLabel?: string
}

export function ReplayVerifyPanel({
  run,
  onReverified,
  triggeredByLabel = "operator-ui",
}: ReplayVerifyPanelProps) {
  const [verifying, setVerifying] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)

  const restingState = deriveReplayState(run)
  const state: ReplayVerifyState = verifying ? "verifying" : restingState

  const handleReverify = useCallback(async () => {
    setVerifying(true)
    setPostError(null)
    try {
      const res = await fetch(
        `/api/proxy/iam/shared-roles/simulate/${encodeURIComponent(run.sim_id)}/replay`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ triggered_by: triggeredByLabel }),
        }
      )
      if (!res.ok) {
        const txt = await res.text().catch(() => "")
        throw new Error(`Replay failed (${res.status}): ${txt || "no body"}`)
      }
      const payload = (await res.json()) as ReplayResponse
      onReverified?.(payload)
    } catch (e) {
      setPostError(e instanceof Error ? e.message : String(e))
    } finally {
      setVerifying(false)
    }
  }, [run.sim_id, triggeredByLabel, onReverified])

  // Panel only renders meaningfully once the sim has completed —
  // ChainDeltaPanel takes care of RUNNING/FAILED visuals upstream.
  if (run.status !== "COMPLETED") return null

  // The transient verifying state has its own minimal visual; ignore
  // STATE_VISUALS for it.
  if (state === "verifying") {
    return (
      <div
        data-replay-state="verifying"
        className="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-4 mt-3"
      >
        <div className="flex items-start gap-3">
          <Loader2 className="h-5 w-5 text-slate-400 animate-spin shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-700">
              Verifying determinism…
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Re-running enumeration against the current engine and graph
              snapshot. Usually takes 1–3 seconds.
            </div>
          </div>
          <Button size="sm" variant="outline" disabled className="shrink-0">
            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            Verifying…
          </Button>
        </div>
      </div>
    )
  }

  const v = STATE_VISUALS[state]
  const { Icon } = v
  const replayedTime = formatRelativeOrIso(run.last_replayed_at)

  return (
    <div
      data-replay-state={state}
      className={`rounded-lg ${v.cardClass} ${v.cardRingClass} p-4 mt-3`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 ${v.iconClass} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <PanelBody
            state={state}
            run={run}
            replayedTime={replayedTime}
            headerClass={v.headerClass}
          />
        </div>
        <PanelCta
          state={state}
          verifying={verifying}
          onReverify={handleReverify}
        />
      </div>
      {postError && (
        <div className="text-xs text-rose-600 mt-2 pl-8">{postError}</div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Per-state body — copy spec verbatim
// ──────────────────────────────────────────────────────────────────────

interface BodyProps {
  state: Exclude<ReplayVerifyState, "verifying">
  run: SimulationRun
  replayedTime: { display: string; tooltip: string }
  headerClass: string
}

function PanelBody({ state, run, replayedTime, headerClass }: BodyProps) {
  // Graceful degradation: per-jewel counts on the (:SimulationRun) may
  // be null/undefined for legacy sims or partial responses. If so,
  // render the verdict + relative time + replay_count headline only,
  // and drop the "X of Y jewels" clause silently — never render
  // "{undefined} of {undefined} jewels".
  const hasJewelTotals =
    typeof run.jewels_total === "number" && run.jewels_total > 0

  switch (state) {
    case "never_verified":
      return (
        <>
          <div className={`text-sm font-medium ${headerClass}`}>
            Determinism not yet verified
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            Run a replay to confirm this plan&apos;s enumeration reproduces
            today against the engine&apos;s recorded result.
          </div>
        </>
      )
    case "historical_untracked":
      return (
        <>
          <div className={`text-sm font-medium ${headerClass}`}>
            Replay history exists, verdict not tracked
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            {run.replay_count} earlier{" "}
            {run.replay_count === 1 ? "replay" : "replays"} ran before
            per-replay verdict capture shipped (2026-05-31). Re-verify to
            record the current verdict.
          </div>
        </>
      )
    case "byte_equivalent":
      return (
        <>
          <div className={`text-sm font-medium ${headerClass}`}>
            Determinism verified
          </div>
          <div className="text-xs text-slate-700 mt-0.5">
            Last replay{" "}
            <time
              dateTime={run.last_replayed_at ?? undefined}
              title={replayedTime.tooltip}
              className="underline decoration-dotted"
            >
              {replayedTime.display}
            </time>{" "}
            matched the recorded result.
            {hasJewelTotals && (
              <>
                {" "}
                {run.jewels_total} of {run.jewels_total} jewels reproduced
                byte-for-byte.
              </>
            )}{" "}
            Replay #{run.replay_count}.
          </div>
        </>
      )
    case "engine_drift":
      return (
        <>
          <div className={`text-sm font-medium ${headerClass}`}>
            Engine produced different result than recorded
          </div>
          <div className="text-xs text-slate-700 mt-0.5">
            Replay{" "}
            <time
              dateTime={run.last_replayed_at ?? undefined}
              title={replayedTime.tooltip}
              className="underline decoration-dotted"
            >
              {replayedTime.display}
            </time>{" "}
            {hasJewelTotals ? (
              <>
                found a difference: enumeration reproduces differently than
                when simulate ran ({run.jewels_total} jewels total).
              </>
            ) : (
              <>differs from the recorded result.</>
            )}{" "}
            Re-verify to check if the difference persists.
          </div>
        </>
      )
    case "plan_drift":
      return (
        <>
          <div className={`text-sm font-medium ${headerClass}`}>
            Plan changed since simulate
          </div>
          <div className="text-xs text-slate-700 mt-0.5">
            This plan was edited after the simulate ran. Re-verifying
            won&apos;t reconcile — the baseline derives from the plan
            body, so the inputs are different now.
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5">
            To capture a fresh baseline,{" "}
            <a
              href={`/iam/shared-roles?role_arn=${encodeURIComponent(run.role_arn)}`}
              className="underline decoration-dotted hover:text-slate-700"
            >
              re-run simulate from this role →
            </a>
          </div>
        </>
      )
    case "source_missing":
      return (
        <>
          <div className={`text-sm font-medium ${headerClass}`}>
            Source plan no longer available
          </div>
          <div className="text-xs text-slate-700 mt-0.5">
            The plan this replay verifies has been deleted or expired. The
            recorded simulate result is preserved but can&apos;t be
            re-derived.
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5">
            To start a new lineage,{" "}
            <a
              href={`/iam/shared-roles?role_arn=${encodeURIComponent(run.role_arn)}`}
              className="underline decoration-dotted hover:text-slate-700"
            >
              browse plans for this role →
            </a>
          </div>
        </>
      )
  }
}

// ──────────────────────────────────────────────────────────────────────
// Per-state CTA — verb is state-specific (never generic "Verify")
// ──────────────────────────────────────────────────────────────────────

interface CtaProps {
  state: Exclude<ReplayVerifyState, "verifying">
  verifying: boolean
  onReverify: () => void
}

function PanelCta({ state, verifying, onReverify }: CtaProps) {
  switch (state) {
    case "never_verified":
      return (
        <Button
          size="sm"
          variant="default"
          onClick={onReverify}
          disabled={verifying}
          className="shrink-0"
        >
          Run replay verify
        </Button>
      )
    case "historical_untracked":
      return (
        <Button
          size="sm"
          variant="default"
          onClick={onReverify}
          disabled={verifying}
          className="shrink-0"
        >
          Re-verify to capture verdict
        </Button>
      )
    case "byte_equivalent":
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={onReverify}
          disabled={verifying}
          className="shrink-0"
        >
          Re-verify
        </Button>
      )
    case "engine_drift":
      return (
        <Button
          size="sm"
          variant="default"
          onClick={onReverify}
          disabled={verifying}
          className="shrink-0 bg-amber-600 hover:bg-amber-700"
        >
          Re-verify
        </Button>
      )
    case "plan_drift":
    case "source_missing":
      // Both states require operator action on a different surface
      // (re-simulate from the role page, or pick a new plan). The
      // body text carries the navigational link — a primary CTA here
      // would be a UX trap. Same pattern, both states.
      return null
  }
}
