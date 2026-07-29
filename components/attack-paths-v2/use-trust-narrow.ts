"use client"

// Fetches the real TRUST_NARROW plan for a path from the live backend, which
// authors it against a live iam:GetRole. NO MOCK — returns null plus an honest
// error string when unavailable.
//
// Two differences from useClosurePreview, both deliberate:
//
//   1. **Lazy.** The plan hits live AWS; firing one per row on render would be
//      an iam:GetRole storm. Nothing runs until the operator opens the panel.
//   2. **No retry-on-failure loop for apply.** Plan is a read and retries
//      safely. Apply is a mutation whose failure mode may be "it landed but
//      the response was lost" — retrying that automatically could re-apply
//      against a policy that has already changed. The operator re-plans.

import { useCallback, useState } from "react"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import { resolveClosurePathId } from "./derive-attack-path-id"
import type {
  TrustNarrowApplyResult,
  TrustNarrowPlan,
  TrustNarrowRefusal,
} from "./trust-narrow-types"

type TrustPathInput = Pick<
  IdentityAttackPath,
  "id" | "attack_path_id" | "nodes" | "crown_jewel_id"
> | null | undefined

interface UseTrustNarrow {
  plan: TrustNarrowPlan | null
  applyResult: TrustNarrowApplyResult | null
  /** Backend refusal, forwarded verbatim so the panel can distinguish a
   *  SHADOW-tier 403 from a drift 409 from a guards-refused 409. */
  refusal: TrustNarrowRefusal | null
  loading: boolean
  applying: boolean
  error: string | null
  /** Runs plan, then simulate. Simulate is a superset — it returns the plan
   *  plus the projected effect — so one call after the other gives the panel
   *  the effect block without a second operator action. */
  load: () => void
  apply: () => void
}

export function useTrustNarrow(path: TrustPathInput): UseTrustNarrow {
  const [plan, setPlan] = useState<TrustNarrowPlan | null>(null)
  const [applyResult, setApplyResult] = useState<TrustNarrowApplyResult | null>(null)
  const [refusal, setRefusal] = useState<TrustNarrowRefusal | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pathKey = path?.id
  const attackPathId = path?.attack_path_id
  const crownJewelId = path?.crown_jewel_id

  const load = useCallback(() => {
    if (!path?.id) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setRefusal(null)
    ;(async () => {
      try {
        const pathId = await resolveClosurePathId(path)
        // simulate returns the plan AND the effect projection, so this is one
        // call, not two.
        const r = await fetch(
          `/api/proxy/attack-paths/path/${encodeURIComponent(pathId)}/trust-narrow/simulate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
            cache: "no-store",
          },
        )
        const body = await r.json().catch(() => null)
        if (cancelled) return
        if (!r.ok || !body || body.error) {
          setRefusal((body as TrustNarrowRefusal) ?? { error: `http_${r.status}` })
          setError(body?.error ?? `http_${r.status}`)
          setPlan(null)
        } else {
          setPlan(body as TrustNarrowPlan)
        }
      } catch (e) {
        if (!cancelled) {
          setError(String((e as Error)?.message ?? e))
          setPlan(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  // Stable scalars only — `path.nodes` is a fresh array ref every parent
  // render, the same trap that caused a perpetual re-fetch in useClosurePreview.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey, attackPathId, crownJewelId])

  const apply = useCallback(() => {
    if (!path?.id || !plan?.plan_token) return
    setApplying(true)
    setError(null)
    setRefusal(null)
    ;(async () => {
      try {
        const pathId = await resolveClosurePathId(path)
        const r = await fetch(
          `/api/proxy/attack-paths/path/${encodeURIComponent(pathId)}/trust-narrow/apply`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan_token: plan.plan_token }),
            cache: "no-store",
          },
        )
        const body = await r.json().catch(() => null)
        if (!r.ok || !body || body.error) {
          setRefusal((body as TrustNarrowRefusal) ?? { error: `http_${r.status}` })
          setError(body?.error ?? `http_${r.status}`)
        } else {
          setApplyResult(body as TrustNarrowApplyResult)
          // The plan's token is single-use in effect: the document it was bound
          // to no longer exists. Clearing it removes the Apply affordance so a
          // second click cannot DRIFT_ABORT against the change we just made.
          setPlan((p) => (p ? { ...p, plan_token: null, execute_available: false } : p))
        }
      } catch (e) {
        setError(String((e as Error)?.message ?? e))
      } finally {
        setApplying(false)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey, attackPathId, crownJewelId, plan?.plan_token])

  return { plan, applyResult, refusal, loading, applying, error, load, apply }
}
