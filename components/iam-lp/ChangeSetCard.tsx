"use client"

import { ChevronDown, ChevronUp } from "lucide-react"
import { useMemo } from "react"
import { cn } from "@/lib/utils"
import type { ConfidenceGroup, DecisionSplit, Disposition, IamGapAnalysis } from "./types"
import { buildChangeSetCounts } from "./resolvers/changeSetCounts"

type ChangeSetCardProps = {
  gap: IamGapAnalysis | null
  split: DecisionSplit
  expanded?: boolean
  onToggleExpanded?: () => void
}

function groupDispositionClasses(disposition: Disposition) {
  switch (disposition) {
    case "auto_apply":
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
    case "protected":
      return "border-slate-200 bg-slate-100 text-slate-700"
    default:
      return "border-amber-200 bg-amber-50 text-amber-700"
  }
}

function serviceLabel(group: ConfidenceGroup) {
  const explicit = group.permissions
    .map((permission) => permission.service_prefix)
    .find(Boolean)
  if (explicit) return explicit.toUpperCase()
  const first = group.permissions.find((permission) => permission.permission?.includes(":"))?.permission
  return first ? first.split(":")[0].toUpperCase() : group.label
}

function groupDecision(
  group: ConfidenceGroup,
  split: DecisionSplit,
): { label: string; disposition: Disposition } {
  const auto = new Set(split.autoApplyPermissions)
  const approval = new Set(split.needsApprovalPermissions)
  const protectedSet = new Set(split.protectedPermissions)
  const permissions = [...new Set(group.permissions.map((row) => row.permission))]
  const autoCount = permissions.filter((permission) => auto.has(permission)).length
  const approvalCount = permissions.filter((permission) => approval.has(permission)).length
  const protectedCount = permissions.filter((permission) => protectedSet.has(permission)).length
  const nonZero = [autoCount, approvalCount, protectedCount].filter((count) => count > 0).length

  if (nonZero > 1) {
    return {
      label: `${autoCount} auto · ${approvalCount} approval · ${protectedCount} protected`,
      disposition: approvalCount > 0 ? "needs_approval" : "protected",
    }
  }
  if (protectedCount > 0) return { label: "Protected", disposition: "protected" }
  if (autoCount > 0) return { label: "Auto-apply", disposition: "auto_apply" }
  return { label: "Needs approval", disposition: "needs_approval" }
}

export function ChangeSetCard({
  gap,
  split,
  expanded = false,
  onToggleExpanded,
}: ChangeSetCardProps) {
  const groups = useMemo(() => gap?.confidence_groups?.groups || [], [gap])

  if (!gap) return null

  const counts = buildChangeSetCounts(gap, split)
  const formatCount = (value: number | null) => value ?? "—"

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Change set</h3>
          <p className="mt-1 text-sm text-slate-600">
            Lead with exact counts. Expand only if the team wants the full permission breakdown.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleExpanded}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {expanded ? "Hide permission list" : "Show permission list"}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Current</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{formatCount(counts.current)}</div>
          <div className="mt-1 text-sm text-slate-600">
            allowed · {formatCount(counts.observed)} observed
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">After safe apply</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{formatCount(counts.afterSafeApply)}</div>
          <div className="mt-1 text-sm text-slate-600">{split.autoApplyCount} safe removals</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Target after approval</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{formatCount(counts.targetAfterApproval)}</div>
          <div className="mt-1 text-sm text-slate-600">
            {split.needsApprovalCount} additional reviewed removals
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <ul className="space-y-2 text-sm text-slate-700">
          <li>• {split.autoApplyCount} safe now</li>
          <li>• {split.needsApprovalCount} need approval</li>
          <li>• Keep {split.protectedCount} protected or reserved permissions</li>
          {split.unclassifiedCount > 0 && (
            <li className="text-rose-700">
              • Hold {split.unclassifiedCount} unclassified permissions until evidence conserves
            </li>
          )}
          <li>• No trust-policy change</li>
          <li>• No resource replacement</li>
        </ul>
      </div>

      {expanded && (
        <div className="mt-5 space-y-3">
          {groups.map((group) => {
            const decision = groupDecision(group, split)
            return (
              <div key={group.group_id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600">
                        {serviceLabel(group)}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em]",
                          groupDispositionClasses(decision.disposition),
                        )}
                      >
                        {decision.label}
                      </span>
                    </div>
                    <div className="mt-3 text-sm font-semibold text-slate-900">{group.label}</div>
                    {group.explanation && <div className="mt-1 text-sm text-slate-600">{group.explanation}</div>}
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {group.permissions.length} permissions
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {group.permissions.map((permission) => (
                    <span
                      key={`${group.group_id}-${permission.permission}`}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                    >
                      {permission.permission}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
