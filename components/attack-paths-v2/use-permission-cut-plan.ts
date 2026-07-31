"use client"

/**
 * Permission-cut plan for ONE (role, jewel) pair.
 *
 * Fetched on an explicit operator action, never on render. The backend
 * re-derives the CUTTABLE band and resolves carrier policies per call, so a
 * hook that fired per row would put that work on a browse surface — and the
 * plan's whole point is that it is recomputed at the moment you ask, because a
 * panel can sit open while a role starts using the jewel.
 *
 * `allowed: false` with a refusal set is a SUCCESSFUL response, not an error.
 * `error` here means the request itself failed. Collapsing the two would turn
 * "the guards say no, here is why" into "something broke", which is the single
 * most important distinction this surface has to preserve.
 */

import { useCallback, useState } from "react"

export type GuardVerdict = "PASS" | "REFUSE" | "UNVERIFIED"

export interface CutGuard {
  guard: string
  verdict: GuardVerdict
  reason: string
}

export interface CarrierPolicy {
  policy_arn: string | null
  policy_name: string | null
  policy_kind: string | null
  is_inline: boolean
  editable: boolean
}

/** The additive instrument: an inline Deny on the role. Present only when the
 *  narrow cannot be EXPRESSED (C8/C9). */
export interface ScopedDenyPlan {
  instrument: "SCOPED_DENY"
  allowed: boolean
  policy_name: string
  denied_actions: string
  denied_resources: string[]
  /** Always [] — a Deny modifies no existing grant. Rendered, not assumed. */
  grants_modified: string[]
  reversal: string
  guards: CutGuard[]
  evidence: Record<string, unknown>
  inline_state?: {
    known: boolean
    total_chars: number
    deny_sids: string[]
    reason: string | null
  }
  snapshot_required: boolean
  execute_available: boolean
}

export interface PermissionCutPlan {
  role_arn: string
  target_jewel: string
  band: string | null
  instrument: "NARROW"
  recommended_instrument: "NARROW" | "SCOPED_DENY" | "NONE"
  allowed: boolean
  actions: string[]
  current_resources: string[]
  proposed_resources: string[]
  /** BOTH sides, always. Never render a narrow without what it keeps. */
  kept_resources: string[]
  removed_resources: string[]
  carrier_policies: CarrierPolicy[]
  guards: CutGuard[]
  evidence: Record<string, unknown>
  scoped_deny: ScopedDenyPlan | null
  snapshot_required: boolean
  execute_available: boolean
  refused_because?: string
}

interface State {
  plan: PermissionCutPlan | null
  loading: boolean
  error: string | null
}

const IDLE: State = { plan: null, loading: false, error: null }

export function usePermissionCutPlan(systemName: string) {
  const [state, setState] = useState<State>(IDLE)

  const reset = useCallback(() => setState(IDLE), [])

  const requestPlan = useCallback(
    async (roleArn: string, jewelRef: string, jewelType = "S3Bucket") => {
      setState({ plan: null, loading: true, error: null })
      try {
        const qs = new URLSearchParams({
          jewel_ref: jewelRef,
          role_arn: roleArn,
          jewel_type: jewelType,
        })
        const res = await fetch(
          `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/permission-cut-plan?${qs}`,
          { method: "POST" },
        )
        const body = await res.json().catch(() => null)

        if (!res.ok) {
          // Transport/backend failure — distinct from a refused plan.
          setState({
            plan: null,
            loading: false,
            error:
              (body?.detail as string) ??
              (body?.error as string) ??
              `plan request failed (${res.status})`,
          })
          return
        }
        setState({ plan: body as PermissionCutPlan, loading: false, error: null })
      } catch (err) {
        setState({
          plan: null,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
    [systemName],
  )

  // `plan` is the payload, `requestPlan` is the action. Naming both `plan`
  // made `...state` spread the payload and then be overwritten by the
  // function — the panel would have received a callback where it expected
  // a plan, and rendered nothing forever.
  return { plan: state.plan, loading: state.loading, error: state.error, requestPlan, reset }
}

/** Guards that block. UNVERIFIED blocks exactly like REFUSE — "we could not
 *  prove it safe" must never render as a soft warning next to a green plan. */
export function blockingGuards(guards: CutGuard[] | undefined): CutGuard[] {
  return (guards ?? []).filter((g) => g.verdict !== "PASS")
}
