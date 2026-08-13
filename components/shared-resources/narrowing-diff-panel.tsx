"use client"

// 3-column OBSERVED / UNCONFIRMED / INVESTIGATE primitive per
// docs/shared-resources-real-data-wiring.md §2 (backend repo).
//
// Discipline:
//  - pattern_render_the_answer_not_the_inventory — the panel renders
//    "what to keep, what to narrow, what to investigate" as columns,
//    not a flat list. The triage IS the answer.
//  - feedback_signal_language — conflict_type labels are descriptive
//    ("Cross-service observation", "Policy drift"), never accusative.
//  - pattern_no_phantom_capabilities_in_ui — empty columns render as
//    "No items in this bucket" (honest small number, not fabrication).
//  - pattern_geometry_must_match_label — the percentage at the top
//    must match the columns (keep + narrow + investigate
//    reconciliation visible to the operator).

import { useEffect, useState } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import type { NarrowingDiff, NarrowingDiffEntry, SharedResourceRow } from "./types"

interface Props {
  row: SharedResourceRow
  onLoaded?: (diff: NarrowingDiff) => void
}

// IAM conflict-type label per §2.1 table.
const IAM_CONFLICT_LABELS: Record<string, string> = {
  cross_service_call: "Cross-service observation",
  policy_drift_action_in_role: "Policy drift",
  unknown: "Unclassified",
}

// SG conflict-type label per §2.2 table.
const SG_CONFLICT_LABELS: Record<string, string> = {
  observed_traffic_no_rule: "Unexplained traffic",
  cidr_overlap_partial_use: "Rule wider than usage",
}

// Backend retains the narrow_away field for compatibility. The UI calls
// it unconfirmed because absence of observation is never removal authority.
const NARROW_AWAY_REASON_LABELS: Record<string, string> = {
  no_evidence_no_dependency: "No supporting use or dependency observed yet",
  no_observed_traffic: "No matching traffic observed in the current window",
  no_consumer_dependency: "No consumer dependency identified in current evidence",
  behavioral_authority_unavailable: "Traffic evidence is not authoritative yet; this rule stays in place",
  outbound_analysis_pending: "Outbound traffic analysis is still in progress; this rule stays in place",
}

// The SG backend's `keep` bucket is intentionally fail-closed: it contains
// positively observed rules *and* rules retained because traffic authority is
// unavailable or outbound analysis is pending. Only the former may be called
// observed in customer-facing evidence. Repartition the latter into the
// unconfirmed display bucket without changing the backend safety decision.
function normalizeEvidenceBuckets(row: SharedResourceRow, diff: NarrowingDiff): NarrowingDiff {
  if (row.type !== "security-group") return diff

  const observed = diff.keep.filter(
    (entry) =>
      (entry.matched_traffic_count ?? 0) > 0 ||
      Boolean(entry.last_observed_at),
  )
  const retainedWithoutObservation = diff.keep
    .filter((entry) => !observed.includes(entry))
    .map((entry) => ({
      ...entry,
      reason: entry.match_reason ?? entry.reason ?? "no_observed_traffic",
    }))
  const unconfirmed = [...diff.narrow_away, ...retainedWithoutObservation]

  return {
    ...diff,
    keep: observed,
    keep_count: observed.length,
    narrow_away: unconfirmed,
    narrow_count: unconfirmed.length,
    narrowable_pct:
      diff.allowed_count > 0
        ? Math.round((unconfirmed.length / diff.allowed_count) * 100)
        : 0,
  }
}

export function NarrowingDiffPanel({ row, onLoaded }: Props) {
  const [diff, setDiff] = useState<NarrowingDiff | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setDiff(null)
    const url =
      row.type === "iam-role"
        ? `/api/proxy/iam/shared-roles/${encodeURIComponent(row.role_name)}/narrowing-diff`
        : `/api/proxy/sg/shared-sgs/${encodeURIComponent(row.sg_id)}/narrowing-diff`
    ;(async () => {
      try {
        const res = await fetch(url, { cache: "no-store" })
        if (!res.ok) {
          throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`)
        }
        const data = normalizeEvidenceBuckets(
          row,
          (await res.json()) as NarrowingDiff,
        )
        if (!cancelled) {
          setDiff(data)
          onLoaded?.(data)
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          setError(msg)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [onLoaded, row])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading narrowing analysis…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <div>
          <div className="font-semibold">Couldn't load narrowing detail</div>
          <div className="mt-0.5 break-all text-rose-700">{error}</div>
        </div>
      </div>
    )
  }

  if (!diff) return null

  const conflictLabels =
    row.type === "iam-role" ? IAM_CONFLICT_LABELS : SG_CONFLICT_LABELS
  const evidenceTier = describeEvidenceTier(diff.evidence_quality.aggregate_c_source)

  return (
    <div
      className="flex flex-col gap-4"
      data-narrowing-diff-panel="true"
      data-narrowing-resource-type={diff.resource_type}
      data-narrowing-pct={diff.narrowable_pct}
      data-narrowing-keep-count={diff.keep_count}
      data-narrowing-narrow-count={diff.narrow_count}
      data-narrowing-investigation-count={diff.investigation_count}
    >
      <div className="flex items-center justify-between text-xs text-slate-500">
        <div>
          <span className="font-semibold text-slate-800">
            {diff.allowed_count} configured
          </span>{" "}
          → observed {diff.keep_count} · unconfirmed {diff.narrow_count} · investigate{" "}
          {diff.investigation_count}
          <span className="text-slate-400"> · {diff.narrowable_pct}% requires a decision</span>
        </div>
        <div
          className="font-mono text-[10px] text-slate-400"
          title={`Evidence quality aggregate C_source = ${diff.evidence_quality.aggregate_c_source} (weakest writer: ${diff.evidence_quality.weakest_source}). Higher = stronger observational evidence backing the narrowing recommendation.`}
        >
          Evidence: {evidenceTier} ({diff.evidence_quality.aggregate_c_source})
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <DiffColumn
          title="Observed"
          subtitle="Positive evidence supports retaining these"
          tone="emerald"
          items={diff.keep}
          renderItem={(entry) =>
            renderItem(entry, row.type, "keep", conflictLabels)
          }
        />
        <DiffColumn
          title="Unconfirmed"
          subtitle="Not observed; retained until LP safety gates prove a decision"
          tone="amber"
          items={diff.narrow_away}
          renderItem={(entry) =>
            renderItem(entry, row.type, "narrow_away", conflictLabels)
          }
        />
        <DiffColumn
          title="Investigate"
          subtitle="Observed activity that needs policy or rule review"
          tone="rose"
          items={diff.investigate}
          renderItem={(entry) =>
            renderItem(entry, row.type, "investigate", conflictLabels)
          }
        />
      </div>
    </div>
  )
}

interface DiffColumnProps {
  title: string
  subtitle: string
  tone: "emerald" | "amber" | "rose"
  items: NarrowingDiffEntry[]
  renderItem: (entry: NarrowingDiffEntry) => React.ReactNode
}

function DiffColumn({ title, subtitle, tone, items, renderItem }: DiffColumnProps) {
  const headerColor =
    tone === "emerald"
      ? "border-emerald-200 text-emerald-700"
      : tone === "amber"
        ? "border-amber-200 text-amber-700"
        : "border-rose-200 text-rose-700"
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3"
      data-narrowing-column={tone}
    >
      <div className={`flex items-baseline justify-between border-b pb-2 ${headerColor}`}>
        <span className="text-xs font-bold uppercase tracking-wider">
          {title}
        </span>
        <span className="font-mono text-[10px] text-slate-400">{items.length}</span>
      </div>
      <div className="-mt-1 text-[10px] leading-4 text-slate-500">{subtitle}</div>
      {items.length === 0 ? (
        <div className="py-2 text-xs italic text-slate-400">
          No items in this bucket.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
          {items.map((entry, i) => (
            <li
              key={i}
              data-narrowing-entry
              className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
            >
              {renderItem(entry)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function renderItem(
  entry: NarrowingDiffEntry,
  resourceType: "iam-role" | "security-group",
  column: "keep" | "narrow_away" | "investigate",
  conflictLabels: Record<string, string>,
): React.ReactNode {
  if (resourceType === "iam-role") {
    return (
      <div>
        <div className="font-mono text-[11px] text-slate-800">
          {entry.action ?? "(unknown action)"}
        </div>
        {column !== "narrow_away" && entry.call_count !== undefined && (
          <div className="text-[10px] text-slate-500">
            {entry.call_count} call{entry.call_count === 1 ? "" : "s"}
            {entry.observation_patterns && entry.observation_patterns.length > 0 && (
              <> · pattern {entry.observation_patterns.join(", ")}</>
            )}
          </div>
        )}
        {entry.conflict_type && (
          <div className="mt-0.5 text-[10px] text-rose-700">
            {conflictLabels[entry.conflict_type] ?? entry.conflict_type}
          </div>
        )}
        {column === "narrow_away" && entry.reason && (
          <div className="mt-0.5 text-[10px] text-amber-700">
            {NARROW_AWAY_REASON_LABELS[entry.reason] ?? entry.reason}
          </div>
        )}
      </div>
    )
  }
  // security-group entry rendering
  const portRange =
    entry.from_port !== undefined && entry.to_port !== undefined
      ? entry.from_port === entry.to_port
        ? `${entry.from_port}`
        : `${entry.from_port}–${entry.to_port}`
      : entry.port?.toString() ?? "all"
  const direction = entry.direction ? `${entry.direction} ` : ""
  return (
    <div>
      <div className="font-mono text-[11px] text-slate-800">
        {direction}
        {entry.protocol ?? "(any)"}/{portRange}
        {entry.cidr ? ` ← ${entry.cidr}` : ""}
        {entry.observed_source ? ` ← observed ${entry.observed_source}` : ""}
      </div>
      {column === "keep" && entry.matched_traffic_count !== undefined && (
        <div className="text-[10px] text-slate-500">
          matched {entry.matched_traffic_count} flow
          {entry.matched_traffic_count === 1 ? "" : "s"}
        </div>
      )}
      {column === "investigate" && entry.traffic_count !== undefined && (
        <div className="text-[10px] text-slate-500">
          {entry.traffic_count} flow{entry.traffic_count === 1 ? "" : "s"} observed
        </div>
      )}
      {entry.conflict_type && (
        <div className="mt-0.5 text-[10px] text-rose-700">
          {conflictLabels[entry.conflict_type] ?? entry.conflict_type}
        </div>
      )}
      {column === "narrow_away" && entry.reason && (
        <div className="mt-0.5 text-[10px] text-amber-700">
          {NARROW_AWAY_REASON_LABELS[entry.reason] ?? entry.reason}
        </div>
      )}
    </div>
  )
}

function describeEvidenceTier(cSource: number): string {
  // Mirrors §11E C_source tiers per spec §2.1.
  if (cSource >= 90) return "Strong"
  if (cSource >= 70) return "Good"
  if (cSource >= 50) return "Moderate"
  if (cSource >= 30) return "Weak"
  return "Limited"
}
