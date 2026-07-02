"use client"

// Shared-role callout — states, in ROLE terms, how many workloads share an
// over-permissive role that reaches the crown jewel, and links to the
// role-split remediation (per-resource analysis). The convergence the attack
// map shows is exactly what the split fixes.
//
// REAL DATA ONLY. The count is the backend's canonical IAMRole.workload_count
// (written by collectors/role_consumer_rollup.py, serialized onto the
// graph-view role node's key_properties). The parent NEVER card-counts the
// canvas lateral fan-out — that fan-out includes subnet/system neighbors that
// do NOT assume the role, so counting cards would overstate a CISO-facing
// number. Rendered only when the backend supplied a concrete count >= 2.
// See memory: feedback_ciso_facing_numbers_verify_against_edges.

import { Users, Scissors, ArrowRight } from "lucide-react"

export interface SharedRoleCalloutData {
  /** Friendly role name, e.g. "alon-demo-ec2-role". */
  roleName: string
  /** Full role ARN (the split-remediation target). */
  roleArn: string
  /** Canonical count of workloads (EC2/Lambda) that assume this role. >= 2 to render. */
  workloadCount: number
  /** The workload ids — from IAMRole.workload_ids. Shown on hover. */
  workloadIds: string[]
  /** Rollup confidence ("complete" | "partial" | …); null when the backend omitted it. */
  confidence: string | null
}

export function SharedRoleCallout({
  data,
  onSplit,
}: {
  data: SharedRoleCalloutData
  onSplit?: (roleName: string) => void
}) {
  const { roleName, workloadCount, workloadIds, confidence } = data
  const noun = workloadCount === 1 ? "workload" : "workloads"
  const idsTitle =
    workloadIds.length > 0
      ? `Workloads assuming ${roleName}: ${workloadIds.join(", ")}`
      : undefined

  return (
    <div className="mx-6 mb-3 flex flex-col gap-2 rounded-lg border border-pink-500/40 bg-pink-500/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div
        className="flex items-start gap-2 text-[12px] leading-snug text-pink-900 dark:text-pink-100"
        title={idsTitle}
      >
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-pink-600 dark:text-pink-300" />
        <span>
          <span className="font-semibold">
            {workloadCount} {noun}
          </span>{" "}
          share <span className="font-mono font-semibold">{roleName}</span>
          {"'s permissions"} — compromising any one assumes this role and reaches
          the crown jewel. A per-workload role split removes the shared blast
          radius.
          {confidence && confidence !== "complete" ? (
            <span className="opacity-60"> · {confidence} coverage</span>
          ) : null}
        </span>
      </div>
      {onSplit ? (
        <button
          type="button"
          onClick={() => onSplit(roleName)}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-pink-500/50 bg-pink-500/15 px-2.5 py-1 text-[11px] font-semibold text-pink-800 transition-colors hover:bg-pink-500/25 dark:text-pink-100 sm:self-auto"
          title={`Open per-resource role-split analysis for ${roleName}`}
        >
          <Scissors className="h-3 w-3" />
          Split roles
          <ArrowRight className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  )
}
