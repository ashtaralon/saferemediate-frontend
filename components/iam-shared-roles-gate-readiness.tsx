"use client"

/**
 * GateReadinessPanel for the shared-roles detail view (PG-8).
 *
 * Polls GET /api/proxy/iam/shared-roles/split-plans/{plan_id}/gate-readiness
 * with the operator's intended mode (CREATE_ONLY for v1, STAGED_LAMBDA_GROUP
 * when Step 8 lands). Renders the per-gate pass/fail status as a checklist
 * so the operator sees what would happen BEFORE clicking execute.
 *
 * Re-fetches on planState change so ApprovalAction → reload bubbles up.
 *
 * Each gate row carries an icon + tone:
 *   passed  → emerald check
 *   failed  → red X + the stable error code + the message
 *   skipped → zinc dash + why it doesn't apply to this mode
 *
 * Honest about its limits: view_parity always shows as "evaluated at
 * execute-time" because it needs a live AWS read the readiness endpoint
 * intentionally avoids (otherwise every plan-detail page load would
 * burn an IAM API call).
 */

import { useEffect, useState } from "react"
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react"

interface GateRow {
  name: string
  status: "passed" | "failed" | "skipped"
  code?: string
  message?: string
}

interface GateReadinessResponse {
  plan_id: string
  plan_state: string
  mode: string
  group_id: string | null
  ready: boolean
  first_blocker: string | null
  gates: GateRow[]
}

export function GateReadinessPanel({
  planId,
  planState,
  mode = "CREATE_ONLY",
  groupId,
}: {
  planId: string
  planState: string
  mode?: "CREATE_ONLY" | "STAGED_LAMBDA_GROUP"
  groupId?: string | null
}) {
  const [data, setData] = useState<GateReadinessResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ mode })
    if (groupId) params.set("group_id", groupId)
    fetch(
      `/api/proxy/iam/shared-roles/split-plans/${encodeURIComponent(planId)}/gate-readiness?${params.toString()}`,
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => "")
          throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`)
        }
        return res.json()
      })
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Unknown error")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [planId, planState, mode, groupId])

  if (loading) {
    return (
      <section className="border rounded-lg p-5 bg-white/40 dark:bg-zinc-950/30">
        <Heading />
        <div className="text-sm text-zinc-700 dark:text-zinc-400 flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Checking gates...
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="border rounded-lg p-5 bg-white/40 dark:bg-zinc-950/30">
        <Heading />
        <div className="text-sm text-red-700 dark:text-red-300">
          Failed to read gate readiness: {error}
        </div>
      </section>
    )
  }

  if (!data) return null

  const passedCount = data.gates.filter((g) => g.status === "passed").length
  const failedCount = data.gates.filter((g) => g.status === "failed").length
  const totalEvaluated = data.gates.filter((g) => g.status !== "skipped").length

  return (
    <section className="border rounded-lg p-5 bg-white/40 dark:bg-zinc-950/30">
      <Heading data={data} passedCount={passedCount} failedCount={failedCount} totalEvaluated={totalEvaluated} />
      <div className="mt-3 space-y-1.5">
        {data.gates.map((g) => (
          <GateRowComponent key={g.name} gate={g} />
        ))}
      </div>
    </section>
  )
}

function Heading({
  data,
  passedCount,
  failedCount,
  totalEvaluated,
}: {
  data?: GateReadinessResponse
  passedCount?: number
  failedCount?: number
  totalEvaluated?: number
}) {
  const isReady = data?.ready === true
  return (
    <div className="mb-1 flex items-start gap-3">
      {data ? (
        isReady ? (
          <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        )
      ) : null}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-400">
          Pre-flight gates {data ? `(${data.mode})` : ""}
        </div>
        <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {data == null
            ? "Reading…"
            : isReady
            ? `Ready to execute (${passedCount}/${totalEvaluated} passing, view_parity at execute-time)`
            : `Blocked — ${failedCount} gate${failedCount === 1 ? "" : "s"} failing`}
        </div>
        {data && !isReady && data.first_blocker ? (
          <div className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
            First blocker: <span className="font-mono">{data.first_blocker}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function GateRowComponent({ gate }: { gate: GateRow }) {
  const Icon = gate.status === "passed" ? CheckCircle2 : gate.status === "failed" ? XCircle : MinusCircle
  const iconTone =
    gate.status === "passed"
      ? "text-emerald-700 dark:text-emerald-400"
      : gate.status === "failed"
      ? "text-red-700 dark:text-red-400"
      : "text-zinc-500 dark:text-zinc-600"
  const nameTone =
    gate.status === "failed"
      ? "text-red-800 dark:text-red-200"
      : gate.status === "passed"
      ? "text-zinc-900 dark:text-zinc-100"
      : "text-zinc-700 dark:text-zinc-400"
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${iconTone}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`font-mono font-semibold ${nameTone}`}>{gate.name}</span>
          {gate.code ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200">
              {gate.code}
            </span>
          ) : null}
        </div>
        {gate.message ? (
          <div
            className={`text-xs mt-0.5 ${
              gate.status === "failed"
                ? "text-red-700 dark:text-red-300"
                : "text-zinc-700 dark:text-zinc-400"
            }`}
          >
            {gate.message}
          </div>
        ) : null}
      </div>
    </div>
  )
}
