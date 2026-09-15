"use client"

import { AlertTriangle, Ban, Check, Clock, Loader2, RotateCcw } from "lucide-react"
import {
  canCancel,
  canRetry,
  failureText,
  isPending,
  type Operation,
  type OperationEvent,
  type OperationStatus,
} from "@/lib/account-onboarding"

const LABELS: Record<string, string> = {
  CONNECT_ACCOUNT: "Connect account",
  VALIDATE_ACCESS: "Validate access",
  DISCOVER_ORGANIZATION: "Discover organization",
  CONNECT_ORGANIZATION_ACCOUNTS: "Connect organization accounts",
  OBSERVE_STACKSET: "Observe StackSet",
  OFFBOARD_ACCOUNT: "Offboard account",
  INSTALL_STACKSET: "Install StackSet",
}

export function operationLabel(operation: Operation): string {
  return LABELS[operation.operation_type] || operation.operation_type
}

export function awaitingChildren(operation: Operation): boolean {
  return operation.result.awaiting_children === true && isPending(operation.status)
}

export function statusText(operation: Operation): string {
  if (awaitingChildren(operation)) return "Connecting accounts"
  const map: Record<OperationStatus, string> = {
    QUEUED: "Queued",
    RUNNING: "Running",
    RETRY_SCHEDULED: "Retry scheduled",
    CANCEL_REQUESTED: "Cancelling",
    SUCCEEDED: "Succeeded",
    PARTIALLY_SUCCEEDED: "Partially succeeded",
    BLOCKED: "Blocked",
    FAILED: "Failed",
    CANCELLED: "Cancelled",
  }
  return map[operation.status]
}

export function StatusPill({ operation }: { operation: Operation }) {
  const tone = operation.status === "SUCCEEDED"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : isPending(operation.status)
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : operation.status === "CANCELLED"
        ? "border-slate-200 bg-slate-50 text-slate-600"
        : "border-amber-200 bg-amber-50 text-amber-800"
  return (
    <span data-status={operation.status} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${tone}`}>
      {statusText(operation)}
    </span>
  )
}

function Icon({ operation }: { operation: Operation }) {
  if (isPending(operation.status)) return <Loader2 className="h-4 w-4 animate-spin" />
  if (operation.status === "SUCCEEDED") return <Check className="h-4 w-4" />
  if (operation.status === "CANCELLED") return <Ban className="h-4 w-4" />
  return <AlertTriangle className="h-4 w-4" />
}

export function OperationCard({
  operation,
  events = [],
  canSubmit,
  busy,
  onCancel,
  onRetry,
}: {
  operation: Operation
  events?: OperationEvent[]
  canSubmit: boolean
  busy?: boolean
  onCancel?: (operation: Operation) => void
  onRetry?: (operation: Operation) => void
}) {
  const pending = isPending(operation.status)
  const positive = operation.status === "SUCCEEDED"
  const detail = positive
    ? operation.steps.at(-1)?.detail || "Completed."
    : awaitingChildren(operation)
      ? "Member account operations are running. Their individual results appear below."
      : pending
        ? operation.status === "QUEUED"
          ? "Saved and waiting for the onboarding worker."
          : operation.status === "RETRY_SCHEDULED" && operation.next_attempt_at
            ? `A transient failure will be retried automatically after ${new Date(operation.next_attempt_at).toLocaleTimeString()}.`
            : "The onboarding worker is processing this request."
        : failureText(operation) || "The operation did not complete."
  return (
    <div
      aria-live="polite"
      data-testid="onboarding-operation"
      data-operation-status={operation.status}
      className={`rounded-xl border p-4 ${positive ? "border-emerald-200 bg-emerald-50/60" : pending ? "border-blue-200 bg-blue-50/60" : "border-amber-200 bg-amber-50/60"}`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${positive ? "bg-emerald-100 text-emerald-700" : pending ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"}`}>
          <Icon operation={operation} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{operationLabel(operation)}</p>
            <StatusPill operation={operation} />
            <span className="font-mono text-xs text-slate-500">{operation.account_id}</span>
          </div>
          <p className="mt-1 text-sm text-slate-700">{detail}</p>
          {operation.failure && !pending ? (
            <p className="mt-1 font-mono text-[11px] text-slate-500">{operation.failure.code}{operation.failure.retryable ? " · retryable" : ""}</p>
          ) : null}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span className="font-mono">{operation.operation_id}</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> attempt {operation.attempt_count}</span>
            {operation.retry_of ? <span>retry of <span className="font-mono">{operation.retry_of}</span></span> : null}
          </p>
          {operation.steps.length ? (
            <ol className="mt-3 space-y-1 border-l border-slate-200 pl-3 text-xs text-slate-600">
              {operation.steps.slice(-6).map((step) => (
                <li key={`${step.step_id}-${step.recorded_at}`}><span className="font-semibold">{step.status.toLowerCase()}</span> · {step.detail || step.step_id}</li>
              ))}
            </ol>
          ) : null}
          {events.length ? (
            <details className="mt-2 text-xs text-slate-500">
              <summary className="cursor-pointer">Audit trail ({events.length})</summary>
              <ol className="mt-1 space-y-0.5">
                {events.map((event) => (
                  <li key={event.sequence}>{new Date(event.at).toLocaleTimeString()} · {event.from_status || "created"} → {event.to_status} · {event.reason_code}</li>
                ))}
              </ol>
            </details>
          ) : null}
        </div>
        {canSubmit && (canCancel(operation) || canRetry(operation)) ? (
          <div className="flex shrink-0 gap-2">
            {canCancel(operation) && onCancel ? (
              <button type="button" disabled={busy} onClick={() => onCancel(operation)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40">Cancel</button>
            ) : null}
            {canRetry(operation) && onRetry ? (
              <button type="button" disabled={busy} onClick={() => onRetry(operation)} className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"><RotateCcw className="h-3 w-3" /> Retry</button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
