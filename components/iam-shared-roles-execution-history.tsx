"use client"

/**
 * ExecutionHistory section for the shared-roles detail view (PG-7).
 *
 * Fetches GET /api/proxy/iam/shared-roles/split-plans/{plan_id}/history
 * on mount + when planState changes (so re-fetches after the operator
 * clicks Execute or Rollback in ApprovalAction).
 *
 * Renders one SharedRolePlanExecution row and one SharedRolePlanRollback
 * row per snapshot, newest-first. Each row shows status, mode, who/when,
 * + a per-role breakdown (created / skipped / failed / deleted / absent).
 *
 * Empty state: explicit "No executions or rollbacks recorded yet." copy —
 * never blank-render and never invent rows. Mirrors the
 * no_mock_numbers_in_ui discipline.
 */

import { useEffect, useState } from "react"
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Clock,
  PlayCircle,
  RotateCcw,
  ChevronDown,
  ChevronRight,
} from "lucide-react"

interface ExecutionRecord {
  execution_id: string
  mode: string
  status: string // STARTED | EXECUTED | FAILED
  started_at: string | null
  completed_at: string | null
  requested_by: string
  force: boolean
  proposed_role_names: string[]
  created_role_arns: string[]
  skipped_role_names: string[]
  failed_role_names: string[]
  failure_reasons: string[]
}

interface RollbackRecord {
  rollback_id: string
  mode: string
  status: string // STARTED | ROLLED_BACK | PARTIAL
  started_at: string | null
  completed_at: string | null
  rolled_back_by: string
  force: boolean
  target_role_arns: string[]
  deleted_role_names: string[]
  absent_role_names: string[]
  failed_role_names: string[]
  failure_reasons: string[]
}

interface HistoryResponse {
  plan_id: string
  plan_state: string
  executions: ExecutionRecord[]
  rollbacks: RollbackRecord[]
}

export function ExecutionHistory({
  planId,
  planState,
}: {
  planId: string
  planState: string
}) {
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Re-fetch on planState change so executing or rolling back via
  // ApprovalAction → reload() bubbles up new history rows.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/proxy/iam/shared-roles/split-plans/${encodeURIComponent(planId)}/history`)
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
  }, [planId, planState])

  if (loading) {
    return (
      <section className="border rounded-lg p-5 bg-white/40 dark:bg-zinc-950/30">
        <Heading />
        <div className="text-sm text-zinc-700 dark:text-zinc-400 flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Loading history...
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="border rounded-lg p-5 bg-white/40 dark:bg-zinc-950/30">
        <Heading />
        <div className="text-sm text-red-700 dark:text-red-300">
          Failed to load history: {error}
        </div>
      </section>
    )
  }

  if (!data) return null

  const total = data.executions.length + data.rollbacks.length
  if (total === 0) {
    return (
      <section className="border rounded-lg p-5 bg-white/40 dark:bg-zinc-950/30">
        <Heading />
        <div className="text-sm text-zinc-700 dark:text-zinc-400">
          No executions or rollbacks recorded yet. Once you approve and
          execute this plan, every attempt — created roles, skipped roles
          (idempotent retries), failed roles, and the operator who
          requested it — will appear here.
        </div>
      </section>
    )
  }

  return (
    <section className="border rounded-lg p-5 bg-white/40 dark:bg-zinc-950/30">
      <Heading total={total} />
      <div className="space-y-3 mt-3">
        {data.executions.map((exec) => (
          <ExecutionRow key={exec.execution_id} exec={exec} />
        ))}
        {data.rollbacks.map((rbk) => (
          <RollbackRow key={rbk.rollback_id} rbk={rbk} />
        ))}
      </div>
    </section>
  )
}

function Heading({ total }: { total?: number }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div>
        <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-400">
          History
        </div>
        <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {total != null ? `${total} attempt${total === 1 ? "" : "s"} recorded` : "Execution + rollback log"}
        </div>
      </div>
    </div>
  )
}

// ─── Execution row ─────────────────────────────────────────────────

function ExecutionRow({ exec }: { exec: ExecutionRecord }) {
  const [open, setOpen] = useState(false)
  const summary = summarizeExecution(exec)
  const Icon = statusIcon(exec.status, "execution")
  const tone = statusTone(exec.status)

  return (
    <div className={`border rounded p-3 ${tone.bg} ${tone.border}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-3 text-left"
      >
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${tone.icon}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-mono font-semibold ${tone.text}`}>
              {exec.status}
            </span>
            <span className="text-xs text-zinc-700 dark:text-zinc-400">
              execute {exec.mode}
            </span>
            {exec.force ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100">
                FORCE
              </span>
            ) : null}
          </div>
          <div className="text-[11px] text-zinc-700 dark:text-zinc-400 mt-0.5">
            {summary}
          </div>
          <div className="text-[10px] text-zinc-600 dark:text-zinc-500 mt-1 font-mono">
            {exec.requested_by} · {formatTimestamp(exec.completed_at ?? exec.started_at)}
          </div>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-zinc-600 dark:text-zinc-500 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-zinc-600 dark:text-zinc-500 shrink-0" />
        )}
      </button>

      {open ? (
        <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
          {exec.created_role_arns.length > 0 ? (
            <RoleList
              label="Created"
              tone="created"
              items={exec.created_role_arns}
              isArn
            />
          ) : null}
          {exec.skipped_role_names.length > 0 ? (
            <RoleList
              label="Skipped (idempotent — already existed with our tag)"
              tone="skipped"
              items={exec.skipped_role_names}
            />
          ) : null}
          {exec.failed_role_names.length > 0 ? (
            <FailedList
              names={exec.failed_role_names}
              reasons={exec.failure_reasons}
            />
          ) : null}
          <div className="text-[10px] font-mono text-zinc-600 dark:text-zinc-500 pt-1">
            execution_id: {exec.execution_id}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── Rollback row ──────────────────────────────────────────────────

function RollbackRow({ rbk }: { rbk: RollbackRecord }) {
  const [open, setOpen] = useState(false)
  const summary = summarizeRollback(rbk)
  const Icon = statusIcon(rbk.status, "rollback")
  const tone = statusTone(rbk.status)

  return (
    <div className={`border rounded p-3 ${tone.bg} ${tone.border}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-3 text-left"
      >
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${tone.icon}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-mono font-semibold ${tone.text}`}>
              {rbk.status}
            </span>
            <span className="text-xs text-zinc-700 dark:text-zinc-400">
              rollback {rbk.mode}
            </span>
            {rbk.force ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100">
                FORCE
              </span>
            ) : null}
          </div>
          <div className="text-[11px] text-zinc-700 dark:text-zinc-400 mt-0.5">
            {summary}
          </div>
          <div className="text-[10px] text-zinc-600 dark:text-zinc-500 mt-1 font-mono">
            {rbk.rolled_back_by} · {formatTimestamp(rbk.completed_at ?? rbk.started_at)}
          </div>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-zinc-600 dark:text-zinc-500 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-zinc-600 dark:text-zinc-500 shrink-0" />
        )}
      </button>

      {open ? (
        <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
          {rbk.deleted_role_names.length > 0 ? (
            <RoleList label="Deleted" tone="deleted" items={rbk.deleted_role_names} />
          ) : null}
          {rbk.absent_role_names.length > 0 ? (
            <RoleList
              label="Already gone (idempotent — NoSuchEntity)"
              tone="skipped"
              items={rbk.absent_role_names}
            />
          ) : null}
          {rbk.failed_role_names.length > 0 ? (
            <FailedList
              names={rbk.failed_role_names}
              reasons={rbk.failure_reasons}
            />
          ) : null}
          <div className="text-[10px] font-mono text-zinc-600 dark:text-zinc-500 pt-1">
            rollback_id: {rbk.rollback_id}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────

function summarizeExecution(exec: ExecutionRecord): string {
  const parts: string[] = []
  if (exec.created_role_arns.length) parts.push(`${exec.created_role_arns.length} created`)
  if (exec.skipped_role_names.length) parts.push(`${exec.skipped_role_names.length} skipped`)
  if (exec.failed_role_names.length) parts.push(`${exec.failed_role_names.length} failed`)
  if (!parts.length) return `Targeting ${exec.proposed_role_names.length} role${exec.proposed_role_names.length === 1 ? "" : "s"}`
  return parts.join(" · ")
}

function summarizeRollback(rbk: RollbackRecord): string {
  const parts: string[] = []
  if (rbk.deleted_role_names.length) parts.push(`${rbk.deleted_role_names.length} deleted`)
  if (rbk.absent_role_names.length) parts.push(`${rbk.absent_role_names.length} absent`)
  if (rbk.failed_role_names.length) parts.push(`${rbk.failed_role_names.length} failed`)
  if (!parts.length) return `Targeting ${rbk.target_role_arns.length} role${rbk.target_role_arns.length === 1 ? "" : "s"}`
  return parts.join(" · ")
}

function statusIcon(status: string, kind: "execution" | "rollback") {
  const s = (status || "").toUpperCase()
  if (s === "EXECUTED" || s === "ROLLED_BACK") return CheckCircle2
  if (s === "FAILED") return XCircle
  if (s === "PARTIAL") return AlertCircle
  if (s === "STARTED") return kind === "rollback" ? RotateCcw : PlayCircle
  return Clock
}

function statusTone(status: string) {
  const s = (status || "").toUpperCase()
  if (s === "EXECUTED" || s === "ROLLED_BACK") {
    return {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-300 dark:border-emerald-800",
      text: "text-emerald-800 dark:text-emerald-200",
      icon: "text-emerald-700 dark:text-emerald-400",
    }
  }
  if (s === "FAILED") {
    return {
      bg: "bg-red-50 dark:bg-red-950/30",
      border: "border-red-300 dark:border-red-800",
      text: "text-red-800 dark:text-red-200",
      icon: "text-red-700 dark:text-red-400",
    }
  }
  if (s === "PARTIAL") {
    return {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-300 dark:border-amber-800",
      text: "text-amber-800 dark:text-amber-200",
      icon: "text-amber-700 dark:text-amber-400",
    }
  }
  // STARTED / unknown
  return {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-300 dark:border-blue-800",
    text: "text-blue-800 dark:text-blue-200",
    icon: "text-blue-700 dark:text-blue-400",
  }
}

function RoleList({
  label,
  tone,
  items,
  isArn = false,
}: {
  label: string
  tone: "created" | "skipped" | "deleted"
  items: string[]
  isArn?: boolean
}) {
  const toneClasses =
    tone === "created"
      ? "text-emerald-900 dark:text-emerald-200 bg-emerald-100/60 dark:bg-emerald-900/30"
      : tone === "deleted"
      ? "text-emerald-900 dark:text-emerald-200 bg-emerald-100/60 dark:bg-emerald-900/30"
      : "text-zinc-800 dark:text-zinc-300 bg-zinc-100/60 dark:bg-zinc-900/30"
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-400 mb-1">
        {label} ({items.length})
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((s) => (
          <span
            key={s}
            className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${toneClasses}`}
            title={s}
          >
            {isArn ? s.split("/").pop() : s}
          </span>
        ))}
      </div>
    </div>
  )
}

function FailedList({ names, reasons }: { names: string[]; reasons: string[] }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-red-700 dark:text-red-400 mb-1">
        Failed ({names.length})
      </div>
      <div className="space-y-1">
        {names.map((n, i) => (
          <div
            key={`${n}-${i}`}
            className="text-[11px] bg-red-100/60 dark:bg-red-900/20 border border-red-300/60 dark:border-red-800/50 rounded px-2 py-1.5"
          >
            <span className="font-mono font-semibold text-red-900 dark:text-red-200">
              {n}
            </span>
            {reasons[i] ? (
              <div className="text-red-800 dark:text-red-300 mt-0.5 font-mono break-all">
                {reasons[i]}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function formatTimestamp(s: string | null): string {
  if (!s) return "—"
  try {
    return new Date(s).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  } catch {
    return s
  }
}
