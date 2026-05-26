"use client"

/**
 * ExecuteActions section for the shared-roles detail view (PG-9).
 *
 * Renders state-driven action buttons that mirror the backend's
 * plan-first state machine:
 *
 *   PROPOSED   → no buttons (operator approves first via ApprovalAction)
 *   APPROVED   → "Execute CREATE_ONLY" button + confirmation dialog
 *                Operator can also retry CREATE_ONLY (idempotent) +
 *                rollback partials.
 *   EXECUTING  → read-only spinner (server is mid-flight; this state
 *                only persists if a worker crashed mid-execute)
 *   EXECUTED   → "Rollback STAGED_LAMBDA_GROUP" (if STAGED ever ran)
 *                + "Rollback CREATE_ONLY" buttons with confirmations.
 *   REJECTED   → no buttons (terminal — plan can no longer execute)
 *   EXPIRED    → no execute, but rollback still allowed (orphan cleanup)
 *
 * Each AWS-mutating button is gated by an AlertDialog with a clear
 * description of what happens (creates / deletes / swaps), what the
 * required env vars are, and what to do on failure.
 *
 * After every successful action, calls onReload() so the parent
 * re-fetches the plan + history. ExecutionHistory (PG-7) renders the
 * audit trail below; this component owns the action triggers.
 */

import { useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PlayCircle,
  RotateCcw,
  ShieldAlert,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface ExecuteActionsProps {
  planId: string
  planState: string
  planExpired: boolean
  onReload: () => void
}

export function ExecuteActions({
  planId,
  planState,
  planExpired,
  onReload,
}: ExecuteActionsProps) {
  // Pre-flight state from the user. requested_by is captured in a
  // small input so audit lineage records who triggered it.
  const [actor, setActor] = useState("")

  // Action state
  type ActionKind =
    | "execute-create-only"
    | "rollback-create-only"
    | "rollback-staged"
    | null
  const [running, setRunning] = useState<ActionKind>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const runExecute = async (mode: "CREATE_ONLY" | "STAGED_LAMBDA_GROUP") => {
    if (!actor.trim()) {
      setError("Your identity (email/name) is required for the audit trail.")
      return
    }
    setRunning(mode === "CREATE_ONLY" ? "execute-create-only" : null)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(
        `/api/proxy/iam/shared-roles/split-plans/${encodeURIComponent(planId)}/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            requested_by: actor.trim(),
            force: false,
          }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const detail = body?.detail ?? body
        const msg = typeof detail === "object"
          ? `${detail.code ?? res.status}: ${detail.message ?? "unknown"}`
          : String(detail || res.statusText)
        throw new Error(msg)
      }
      const swapped = body?.created?.length ?? body?.swapped?.length ?? 0
      const skipped = body?.skipped?.length ?? 0
      const failed = body?.failed?.length ?? 0
      const finalState = body?.final_plan_state ?? "?"
      setSuccess(
        `Execute ${mode} → ${finalState}: ${swapped} created/swapped, ${skipped} skipped, ${failed} failed.`,
      )
      onReload()
    } catch (e: any) {
      setError(e?.message ?? "Unknown error")
    } finally {
      setRunning(null)
    }
  }

  const runRollback = async (mode: "CREATE_ONLY" | "STAGED_LAMBDA_GROUP") => {
    if (!actor.trim()) {
      setError("Your identity (email/name) is required for the audit trail.")
      return
    }
    setRunning(mode === "CREATE_ONLY" ? "rollback-create-only" : "rollback-staged")
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(
        `/api/proxy/iam/shared-roles/split-plans/${encodeURIComponent(planId)}/rollback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            rolled_back_by: actor.trim(),
            force: false,
          }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const detail = body?.detail ?? body
        const msg = typeof detail === "object"
          ? `${detail.code ?? res.status}: ${detail.message ?? "unknown"}`
          : String(detail || res.statusText)
        throw new Error(msg)
      }
      const deleted = body?.deleted?.length ?? body?.reverted?.length ?? 0
      const absent = body?.absent?.length ?? body?.skipped?.length ?? 0
      const failed = body?.failed?.length ?? 0
      const finalState = body?.final_plan_state ?? "?"
      setSuccess(
        `Rollback ${mode} → ${finalState}: ${deleted} reverted, ${absent} skipped, ${failed} failed.`,
      )
      onReload()
    } catch (e: any) {
      setError(e?.message ?? "Unknown error")
    } finally {
      setRunning(null)
    }
  }

  // ── State-driven UI ───────────────────────────────────────

  if (planState === "PROPOSED") {
    // Nothing to do here — operator is at the "Approve" step
    return null
  }

  if (planState === "REJECTED") {
    return (
      <Card className="border-l-4 border-l-zinc-400">
        <CardContent className="py-3 text-sm text-zinc-700 dark:text-zinc-400">
          This plan is <span className="font-mono">REJECTED</span> — terminal.
          No further execute or rollback actions are available. To act on
          these shared roles again, generate a fresh plan.
        </CardContent>
      </Card>
    )
  }

  if (planState === "EXECUTING") {
    return (
      <Card className="border-l-4 border-l-blue-600">
        <CardContent className="py-3 text-sm text-zinc-700 dark:text-zinc-400 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          Plan is in <span className="font-mono">EXECUTING</span> state on the
          server. If this persists for more than a few minutes, a worker may
          have crashed mid-execute — check the History panel below for the
          last execution snapshot.
        </CardContent>
      </Card>
    )
  }

  // APPROVED / EXECUTED / EXPIRED — actionable states
  return (
    <Card className="border-l-4 border-l-amber-600">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          Execute &amp; rollback actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-zinc-700 dark:text-zinc-400">
          AWS-mutating actions below. Every click writes an audit
          event before any mutation. See History (below) for past attempts.
        </p>

        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-400">
            Your identity (audit trail)
          </label>
          <input
            type="text"
            placeholder="email or name"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            disabled={running !== null}
            className="mt-1 w-full md:w-80 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm font-mono"
          />
        </div>

        {error ? (
          <div className="flex items-start gap-2 text-xs text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded p-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div className="font-mono break-all">{error}</div>
          </div>
        ) : null}

        {success ? (
          <div className="flex items-start gap-2 text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded p-2">
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>{success}</div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {/* Execute CREATE_ONLY — available on APPROVED. Idempotent
              retry on retry-after-partial. */}
          {planState === "APPROVED" && !planExpired ? (
            <ExecuteConfirm
              onConfirm={() => runExecute("CREATE_ONLY")}
              loading={running === "execute-create-only"}
              disabled={running !== null || !actor.trim()}
            />
          ) : null}

          {/* Rollback CREATE_ONLY — available on APPROVED / EXECUTED /
              EXPIRED. Deletes IAM roles tagged with this plan_id. */}
          {(planState === "APPROVED" ||
            planState === "EXECUTED" ||
            planState === "EXPIRED") ? (
            <RollbackCreateOnlyConfirm
              onConfirm={() => runRollback("CREATE_ONLY")}
              loading={running === "rollback-create-only"}
              disabled={running !== null || !actor.trim()}
            />
          ) : null}

          {/* Rollback STAGED_LAMBDA_GROUP — available on APPROVED /
              EXECUTED / EXPIRED. Swaps modified Lambdas back. Operator
              typically runs this BEFORE Rollback CREATE_ONLY if any
              STAGED execute ran (revert Lambdas first, then delete
              the now-orphan roles). */}
          {(planState === "APPROVED" ||
            planState === "EXECUTED" ||
            planState === "EXPIRED") ? (
            <RollbackStagedConfirm
              onConfirm={() => runRollback("STAGED_LAMBDA_GROUP")}
              loading={running === "rollback-staged"}
              disabled={running !== null || !actor.trim()}
            />
          ) : null}
        </div>

        {planExpired ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            Plan expired — execute is unavailable. Rollback paths still work
            (orphan cleanup must survive expiry).
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ─── Confirmation dialogs ─────────────────────────────────────

function ExecuteConfirm({
  onConfirm,
  loading,
  disabled,
}: {
  onConfirm: () => void
  loading: boolean
  disabled: boolean
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          disabled={disabled || loading}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
          )}
          Execute (CREATE_ONLY)
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Execute CREATE_ONLY?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-xs leading-relaxed">
            <span className="block">
              This creates new IAM roles + inline policies in AWS, tagged with{" "}
              <code className="font-mono">cyntro:plan_id=&lt;id&gt;</code>. The
              original shared role stays intact; no consumers are attached to
              the new roles yet.
            </span>
            <span className="block">
              Requires{" "}
              <code className="font-mono">SHARED_ROLES_CREATE_ONLY=true</code>{" "}
              on the Render env. The gate-readiness panel above shows whether
              this will succeed.
            </span>
            <span className="block">
              Re-runnable: idempotent — already-created roles are skipped.
              Failures roll the plan state back to APPROVED for retry.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Execute
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RollbackCreateOnlyConfirm({
  onConfirm,
  loading,
  disabled,
}: {
  onConfirm: () => void
  loading: boolean
  disabled: boolean
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          disabled={disabled || loading}
          variant="outline"
          className="border-orange-300 text-orange-800 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-200 dark:hover:bg-orange-950"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          )}
          Rollback CREATE_ONLY
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rollback CREATE_ONLY?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-xs leading-relaxed">
            <span className="block">
              Deletes every IAM role tagged with this plan's{" "}
              <code className="font-mono">cyntro:plan_id</code>. Inline
              policies are removed first, then{" "}
              <code className="font-mono">iam:DeleteRole</code>.
            </span>
            <span className="block">
              <strong>If any Lambdas were swapped via STAGED:</strong> run{" "}
              <em>Rollback STAGED_LAMBDA_GROUP</em> first to revert them.
              Otherwise this fails on those roles with{" "}
              <code className="font-mono">DeleteConflict</code> (the Lambda is
              still attached).
            </span>
            <span className="block">
              On full success: plan transitions to{" "}
              <code className="font-mono">REJECTED</code> (terminal).
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-orange-600 hover:bg-orange-700"
          >
            Rollback
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RollbackStagedConfirm({
  onConfirm,
  loading,
  disabled,
}: {
  onConfirm: () => void
  loading: boolean
  disabled: boolean
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          disabled={disabled || loading}
          variant="outline"
          className="border-red-300 text-red-800 hover:bg-red-50 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-950"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          )}
          Rollback STAGED_LAMBDA_GROUP
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rollback STAGED_LAMBDA_GROUP?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-xs leading-relaxed">
            <span className="block">
              Swaps every Lambda that this plan's STAGED execute modified
              back to the original shared role via{" "}
              <code className="font-mono">lambda.update_function_configuration</code>
              . Per-Lambda atomic through UnifiedPipeline (snapshot + canary +
              auto-rollback per Lambda).
            </span>
            <span className="block">
              Requires{" "}
              <code className="font-mono">SHARED_ROLES_STAGED_LIVE_AWS=true</code>
              on the Render env. View-parity is re-verified — refuses if the
              original role's policy has drifted since plan generation.
            </span>
            <span className="block">
              On full success: plan transitions to{" "}
              <code className="font-mono">REJECTED</code>. The scoped roles
              created by CREATE_ONLY are NOT deleted — run{" "}
              <em>Rollback CREATE_ONLY</em> separately to clean them up.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700"
          >
            Rollback Lambdas
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
