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
//
// FRESHNESS. workload_count is a DERIVED-CACHED value: the rollup is a periodic
// batch (~4h via consumer_edges_sync), so a role's count is stale from the
// moment its consumers change until the next batch. `confidence` does NOT guard
// this — it's a coverage axis (was-evidence-complete when the rollup ran), and a
// stale count keeps its "complete" badge because they freeze together on the
// same cache. Only `syncedAt` is on the freshness axis. So we ALWAYS show the
// age, and past a missed-batch threshold we soften the claim ("~N … count may be
// stale") so a frozen number can't silently vouch for itself to a CISO.
// See memory: pattern_derived_value_staleness_on_source_invalidation.

import { Users, Scissors, ArrowRight } from "lucide-react"

// The rollup batch runs ~every 4h (consumer_edges_sync). A count older than a
// couple of days = ~12 missed batches → the pipeline likely stopped (e.g. a
// dead Render scheduler) and the number may not reflect current consumers.
// Erring toward flagging is the safe direction for a security claim.
const STALE_AFTER_HOURS = 48

export interface SharedRoleCalloutData {
  /** Friendly role name, e.g. "alon-demo-ec2-role". */
  roleName: string
  /** Full role ARN (the split-remediation target). */
  roleArn: string
  /** Canonical count of workloads (EC2/Lambda) that assume this role. >= 2 to render. */
  workloadCount: number
  /** The workload ids — from IAMRole.workload_ids. Shown on hover. */
  workloadIds: string[]
  /** Rollup confidence ("complete" | "partial" | …) — a COVERAGE axis, NOT
   *  freshness. null when the backend omitted it. */
  confidence: string | null
  /** ISO timestamp the rollup last wrote this count
   *  (IAMRole.workload_count_synced_at). The ONLY freshness signal. null when
   *  the backend omitted it. */
  syncedAt: string | null
}

/** Relative age + staleness for the rollup timestamp. Returns null when the
 *  timestamp is absent or unparseable (→ no age shown, no soften — honest,
 *  never a fabricated freshness). */
function freshness(
  syncedAt: string | null,
): { label: string; isStale: boolean } | null {
  if (!syncedAt) return null
  const t = Date.parse(syncedAt)
  if (Number.isNaN(t)) return null
  const ageHrs = (Date.now() - t) / 3_600_000
  const ageDays = ageHrs / 24
  let label: string
  if (ageHrs < 1) label = "just now"
  else if (ageHrs < 24) label = `${Math.round(ageHrs)}h ago`
  else if (ageDays < 2) label = "yesterday"
  else if (ageDays < 30) label = `${Math.round(ageDays)} days ago`
  else label = new Date(t).toISOString().slice(0, 10)
  return { label, isStale: ageHrs > STALE_AFTER_HOURS }
}

export function SharedRoleCallout({
  data,
  onSplit,
}: {
  data: SharedRoleCalloutData
  onSplit?: (roleName: string) => void
}) {
  const { roleName, workloadCount, workloadIds, confidence, syncedAt } = data
  const fresh = freshness(syncedAt)
  const stale = fresh?.isStale ?? false
  const noun = workloadCount === 1 ? "workload" : "workloads"
  // Soften the count itself when stale — "~N" signals "approximately".
  const countText = stale ? `~${workloadCount}` : `${workloadCount}`
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
            {countText} {noun}
          </span>{" "}
          share <span className="font-mono font-semibold">{roleName}</span>
          {"'s permissions"} — compromising any one assumes this role and reaches
          the crown jewel. A per-workload role split removes the shared blast
          radius.
          {stale ? (
            <span className="font-medium text-amber-700 dark:text-amber-300">
              {" "}
              Count may be stale — last synced {fresh?.label}.
            </span>
          ) : fresh ? (
            <span className="opacity-60"> · as of {fresh.label}</span>
          ) : null}
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
