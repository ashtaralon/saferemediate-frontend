"use client"

import { ArrowRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { IAM_LP_COPY } from "./copy"
import type {
  ApprovalRequestSummary,
  DecisionSplit,
  ExecutionState,
  IamGapAnalysis,
} from "./types"

type ExecutionPlanProps = {
  gap: IamGapAnalysis | null
  split: DecisionSplit
  execution: ExecutionState
  verdictBucket: "blocked" | "manual_review" | "human_approval" | "auto_execute"
  blockedReason?: string | null
  onSimulate: (permissions: string[]) => Promise<void>
  onApplySafeSet: (permissions: string[]) => Promise<void>
  onRequestApproval: (permissions: string[]) => Promise<void>
  onRollback: () => Promise<void>
  onApproveRequest?: (requestId: string) => Promise<void>
  onRejectRequest?: (requestId: string) => Promise<void>
  onExecuteApprovedRequest?: (requestId: string) => Promise<void>
}

const STAGES = ["Simulate", "Snapshot", "Apply", "Verify", "Rollback available"] as const

function humanizeExecutionError(error?: string | null) {
  if (!error) return null
  try {
    const parsed = JSON.parse(error) as {
      error?: unknown
      message?: unknown
      reason_code?: unknown
      detail?: unknown
    }
    const message =
      (typeof parsed.message === "string" && parsed.message.trim()) ||
      (typeof parsed.error === "string" && parsed.error.trim()) ||
      (typeof parsed.detail === "string" && parsed.detail.trim()) ||
      error
    const reasonCode =
      typeof parsed.reason_code === "string" && parsed.reason_code.trim()
        ? parsed.reason_code.trim()
        : null
    return reasonCode ? `${message} (${reasonCode})` : message
  } catch {
    return error
  }
}

function stageState(index: number, execution: ExecutionState) {
  if (index === 0 && execution.simulation) return execution.simulation.ok ? "done" : "failed"
  if (index === 1 && execution.snapshot) return execution.snapshot.status
  if (index === 2 && execution.apply) return execution.apply.ok ? "done" : "failed"
  if (index === 3 && execution.verify) return execution.verify.ok ? "done" : "failed"
  if (index === 4 && execution.rollback?.available) return "done"
  return "idle"
}

function stageNote(
  gap: IamGapAnalysis | null,
  execution: ExecutionState,
  split: DecisionSplit,
  verdictBucket: ExecutionPlanProps["verdictBucket"],
  blockedReason?: string | null,
) {
  if (!gap) return ""
  if (verdictBucket === "blocked") {
    return blockedReason
      ? `Blocked by the mutation boundary: ${blockedReason} Approval cannot override this state.`
      : "Blocked by the mutation boundary. Investigate evidence coverage or dependencies before retrying."
  }
  if (execution.approval?.status === "EXECUTED") {
    return `Approved request ${execution.approval.request_id} executed from the stored exact permission set.`
  }
  if (execution.approval?.status === "APPROVED") {
    return `Approved request ${execution.approval.request_id} is ready to execute.`
  }
  if (execution.approval?.status === "EXECUTING") {
    return `Approved request ${execution.approval.request_id} is executing. A second execution is blocked.`
  }
  if (execution.approval?.status === "PENDING_APPROVAL") {
    return `Approval request ${execution.approval.request_id} is pending review.`
  }
  if (execution.approval?.status === "REJECTED") {
    return `Approval request ${execution.approval.request_id} was rejected. Review the note and submit a new request if needed.`
  }
  if (execution.verify?.ok) return execution.verify.message || "Applied. Rollback available."
  if (execution.apply?.ok) {
    return execution.snapshot?.snapshot_id
      ? `Snapshot ${execution.snapshot.snapshot_id} written before mutation.`
      : "Apply completed. Rollback metadata ready."
  }
  if (execution.simulation?.ok) {
    return `No breaking dependency found for the ${split.autoApplyCount} auto-apply removals.`
  }
  if (!gap.is_remediable) return gap.remediable_reason
  return "Simulate the selected change set before applying any IAM mutation."
}

function formatWhen(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function ApprovalStatusCard({
  request,
  canExecuteApprovedRequest,
  blockedReason,
  onApproveRequest,
  onRejectRequest,
  onExecuteApprovedRequest,
}: {
  request: ApprovalRequestSummary
  canExecuteApprovedRequest: boolean
  blockedReason?: string | null
  onApproveRequest?: (requestId: string) => Promise<void>
  onRejectRequest?: (requestId: string) => Promise<void>
  onExecuteApprovedRequest?: (requestId: string) => Promise<void>
}) {
  const requestedAt = formatWhen(request.requested_at)
  const approvedAt = formatWhen(request.approved_at)
  const rejectedAt = formatWhen(request.rejected_at)
  const executedAt = formatWhen(request.executed_at)
  const executionError = humanizeExecutionError(request.execution_error)

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Approval request</div>
          <div className="mt-1 text-base font-semibold text-slate-950">{request.request_id}</div>
          <div className="mt-2 text-sm text-slate-700">
            {request.permissions_count} permissions frozen for review
          </div>
          {request.status === "EXECUTING" && (
            <div className="mt-2 text-sm font-medium text-sky-700">
              Execution in progress. Duplicate execution is blocked.
            </div>
          )}
          <div className="mt-2 space-y-1 text-sm text-slate-600">
            <div>Requested by: {request.requested_by}</div>
            {requestedAt && <div>Requested at: {requestedAt}</div>}
            {request.status === "APPROVED" && request.approved_by && (
              <div>Approved by: {request.approved_by}{approvedAt ? ` · ${approvedAt}` : ""}</div>
            )}
            {request.status === "REJECTED" && request.rejected_by && (
              <div>Rejected by: {request.rejected_by}{rejectedAt ? ` · ${rejectedAt}` : ""}</div>
            )}
            {request.status === "EXECUTED" && request.executed_by && (
              <div>Executed by: {request.executed_by}{executedAt ? ` · ${executedAt}` : ""}</div>
            )}
          </div>
          {request.requester_note && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <span className="font-medium">Requester note:</span> {request.requester_note}
            </div>
          )}
          {request.status === "REJECTED" && request.rejection_note && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <span className="font-medium">Rejection note:</span> {request.rejection_note}
            </div>
          )}
          {executionError && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <span className="font-medium">Last execution error:</span> {executionError}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {request.status === "PENDING_APPROVAL" && onApproveRequest && (
            <button
              type="button"
              onClick={() => void onApproveRequest(request.request_id)}
              className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
            >
              Approve
            </button>
          )}
          {request.status === "PENDING_APPROVAL" && onRejectRequest && (
            <button
              type="button"
              onClick={() => void onRejectRequest(request.request_id)}
              className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
            >
              Reject
            </button>
          )}
          {request.status === "APPROVED" && onExecuteApprovedRequest && (
            <button
              type="button"
              disabled={!canExecuteApprovedRequest}
              onClick={() => void onExecuteApprovedRequest(request.request_id)}
              title={
                canExecuteApprovedRequest
                  ? "Execute the approved exact change set"
                  : blockedReason || "Execution is blocked until the evidence issue is resolved."
              }
              className={cn(
                "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition",
                canExecuteApprovedRequest
                  ? "bg-[#2D51DA] text-white hover:bg-[#2446c0]"
                  : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-500",
              )}
            >
              Execute approved request
            </button>
          )}
        </div>
      </div>
      {request.status === "APPROVED" && !canExecuteApprovedRequest && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Approval is recorded, but execution is currently blocked. {blockedReason || "Resolve the safety hold and re-simulate before executing."}
        </div>
      )}
    </div>
  )
}

export function ExecutionPlan({
  gap,
  split,
  execution,
  verdictBucket,
  blockedReason,
  onSimulate,
  onApplySafeSet,
  onRequestApproval,
  onRollback,
  onApproveRequest,
  onRejectRequest,
  onExecuteApprovedRequest,
}: ExecutionPlanProps) {
  if (!gap) return null

  const approvalPathAvailable = verdictBucket !== "blocked"
  const simulateSelection =
    split.autoApplyPermissions.length > 0
      ? split.autoApplyPermissions
      : [...split.autoApplyPermissions, ...split.needsApprovalPermissions]

  const disabled = !gap.is_remediable

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">Execution plan</h3>
      <p className="mt-1 text-sm text-slate-600">
        Keep the path obvious: simulate, snapshot, apply, verify, and preserve rollback.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {STAGES.map((stage, index) => {
          const state = stageState(index, execution)
          return (
            <div key={stage} className="flex items-center gap-3">
              <div
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium",
                  state === "done" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                  state === "failed" && "border-rose-200 bg-rose-50 text-rose-700",
                  state === "pending" && "border-amber-200 bg-amber-50 text-amber-700",
                  state === "ready" && "border-sky-200 bg-sky-50 text-sky-700",
                  state === "idle" && "border-slate-200 bg-slate-50 text-slate-600",
                )}
              >
                {stage}
              </div>
              {index < STAGES.length - 1 && <ArrowRight className="h-4 w-4 text-slate-400" />}
            </div>
          )
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
        {stageNote(gap, execution, split, verdictBucket, blockedReason)}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={disabled || simulateSelection.length === 0}
          onClick={() => void onSimulate(simulateSelection)}
          className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {IAM_LP_COPY.simulate}
        </button>

        {split.autoApplyCount > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void onApplySafeSet(split.autoApplyPermissions)}
            className="inline-flex items-center justify-center rounded-full bg-[#2D51DA] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2446c0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {IAM_LP_COPY.applySafe(split.autoApplyCount)}
          </button>
        )}

        {split.needsApprovalCount > 0 && approvalPathAvailable && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void onRequestApproval(split.needsApprovalPermissions)}
            className="inline-flex items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {IAM_LP_COPY.requestApproval(split.needsApprovalCount)}
          </button>
        )}

        {split.needsApprovalCount > 0 && !approvalPathAvailable && (
          <button
            type="button"
            disabled
            title={blockedReason || "Approval cannot override a blocked mutation boundary."}
            className="inline-flex cursor-not-allowed items-center justify-center rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-500"
          >
            Approval unavailable while blocked
          </button>
        )}

        <button
          type="button"
          disabled={!execution.rollback?.available}
          onClick={() => void onRollback()}
          className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {execution.rollback?.status === "running" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Roll back
        </button>
      </div>

      {execution.approval && (
        <ApprovalStatusCard
          request={execution.approval}
          canExecuteApprovedRequest={approvalPathAvailable}
          blockedReason={blockedReason}
          onApproveRequest={onApproveRequest}
          onRejectRequest={onRejectRequest}
          onExecuteApprovedRequest={onExecuteApprovedRequest}
        />
      )}
    </section>
  )
}
