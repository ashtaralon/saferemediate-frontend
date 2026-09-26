"use client"

import { useEffect, useState } from "react"

import {
  LP_RESOLVE_ENABLED,
  fetchLpOutstanding,
  submitLpResolve,
  type LpOutstanding,
} from "@/lib/lp-held-mutation"

type Plan = { roleArn: string; roleId: string; planHead: string } | undefined

const STATE_COPY: Record<string, string> = {
  PLANNED: "An Apply started and recorded no outcome. It may still have been writing, so the first Resolve only fences it; resolve again to reconcile.",
  PARTIALLY_APPLIED: "An Apply wrote some of its changes and then failed.",
  APPLY_OUTCOME_UNKNOWN: "An Apply's outcome is unknown: its readback did not match and compensation was not proven.",
  APPLIED_UNVERIFIED: "An Apply wrote its changes but they were not verified.",
  RESOLUTION_FENCED: "Resolution fenced this Apply; resolve again to reconcile from the live policies.",
  RESOLUTION_DIVERGED: "The live policies match neither the preimage nor the intended change. Resolve after they are corrected outside Cyntro.",
  RESOLVED_PARTIAL: "Resolved as partially applied. Restore puts every policy back to its preimage.",
}

const VERDICT_COPY: Record<string, string> = {
  applied: "Live policies show every intended change.",
  not_applied: "Live policies are all at their preimage.",
  partial: "Live policies show some intended changes, the rest at their preimage.",
  diverged: "Live policies differ from both the preimage and the intended change.",
  unreadable: "Live policies could not be read.",
}

/**
 * The operation holding this role, as the backend ledger and a live read report it.
 * The role stays held (no new Apply) until an operator explicitly resolves it and
 * the backend proves the outcome. Nothing here resolves on its own.
 */
export function LpOutstandingPanel({
  plan,
  onResolved,
  lookupEnabled = true,
  refresh = 0,
}: {
  plan: Plan
  onResolved: () => void
  /** false: no ledger read at all (a held surface stays inert). The tab keeps its default. */
  lookupEnabled?: boolean
  /** Bumped by the caller after an Apply whose outcome is not confirmed: re-read the holder. */
  refresh?: number
}) {
  const [outstanding, setOutstanding] = useState<LpOutstanding | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let current = true
    setOutstanding(null)
    if (!plan || !lookupEnabled) return
    void fetchLpOutstanding(plan).then((found) => {
      if (current) setOutstanding(found)
    })
    return () => {
      current = false
    }
  }, [plan?.roleArn, plan?.roleId, version, lookupEnabled, refresh])

  if (!plan || !outstanding || outstanding.state === "VERIFIED") {
    return message ? <div role="status" className="text-sm">{message}</div> : null
  }
  const bound = { operationId: outstanding.operationId, roleArn: plan.roleArn, roleId: plan.roleId }

  async function resolve() {
    const result = await submitLpResolve(bound)
    const body = "body" in result ? (result.body as Record<string, unknown> | null) : null
    const detail = (body?.detail as Record<string, unknown> | undefined) ?? body ?? undefined
    const code = ("code" in result ? result.code : undefined) ?? (detail?.code as string | undefined)
    if (code === "RESOLVE_HELD") {
      setMessage("Resolution stays off until the installed ledger and lifecycle process are proven.")
      return
    }
    if (result.ok && body?.code === "RESOLVED") {
      setMessage(`Resolved: ${String(body.state)}.`)
      setVersion((value) => value + 1)
      onResolved()
      return
    }
    setMessage(`Resolution did not complete (${String(code ?? `HTTP ${result.status}`)}). The role stays held.`)
    setVersion((value) => value + 1)
  }

  return (
    <div data-testid="lp-outstanding-panel" className="rounded-lg border border-amber-400 p-3 text-sm">
      <div className="font-medium">This role is held: operation {outstanding.operationId}</div>
      <div>{STATE_COPY[outstanding.state] ?? `State: ${outstanding.state}.`}</div>
      <div className="mt-1 text-slate-600">{VERDICT_COPY[outstanding.verdict]}</div>
      <ul className="mt-1">
        {Object.entries(outstanding.perPolicy).map(([name, state]) => (
          <li key={name}>
            {name}: {state}
          </li>
        ))}
      </ul>
      {outstanding.resolvable && (
        <button type="button" className="mt-2 rounded border px-3 py-1" onClick={resolve} aria-disabled={!LP_RESOLVE_ENABLED}>
          Resolve from live state
        </button>
      )}
      {message && (
        <div role="status" className="mt-2">
          {message}
        </div>
      )}
    </div>
  )
}
