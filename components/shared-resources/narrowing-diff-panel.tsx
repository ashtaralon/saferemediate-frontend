"use client"

// 3-column KEEP / NARROW AWAY / INVESTIGATE primitive per
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

// NARROW_AWAY reason label (IAM + SG share this taxonomy partially).
const NARROW_AWAY_REASON_LABELS: Record<string, string> = {
  no_evidence_no_dependency: "No evidence, no dependency",
  no_observed_traffic: "No observed traffic",
  no_consumer_dependency: "No consumer dependency",
}

export function NarrowingDiffPanel({ row }: Props) {
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
        const data = (await res.json()) as NarrowingDiff
        if (!cancelled) setDiff(data)
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
  }, [row])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading narrowing analysis…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 p-3 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-200">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <div>
          <div className="font-semibold">Couldn't load narrowing detail</div>
          <div className="text-rose-300/80 mt-0.5 break-all">{error}</div>
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
      <div className="flex items-center justify-between text-xs text-slate-400">
        <div>
          <span className="font-semibold text-slate-200">
            {diff.allowed_count} allowed
          </span>{" "}
          → keep {diff.keep_count} · narrow {diff.narrow_count} · investigate{" "}
          {diff.investigation_count}
          <span className="text-slate-500"> · {diff.narrowable_pct}% narrowable</span>
        </div>
        <div
          className="font-mono text-[10px] text-slate-500"
          title={`Evidence quality aggregate C_source = ${diff.evidence_quality.aggregate_c_source} (weakest writer: ${diff.evidence_quality.weakest_source}). Higher = stronger observational evidence backing the narrowing recommendation.`}
        >
          Evidence: {evidenceTier} ({diff.evidence_quality.aggregate_c_source})
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <DiffColumn
          title="Keep"
          subtitle="Observed activity supports keeping these"
          tone="emerald"
          items={diff.keep}
          renderItem={(entry) =>
            renderItem(entry, row.type, "keep", conflictLabels)
          }
        />
        <DiffColumn
          title="Narrow away"
          subtitle="No observed activity — safe to remove"
          tone="amber"
          items={diff.narrow_away}
          renderItem={(entry) =>
            renderItem(entry, row.type, "narrow_away", conflictLabels)
          }
        />
        <DiffColumn
          title="Investigate"
          subtitle="Observed activity that doesn't match the policy/rules"
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
      ? "text-emerald-300 border-emerald-500/40"
      : tone === "amber"
        ? "text-amber-300 border-amber-500/40"
        : "text-rose-300 border-rose-500/40"
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900/40 p-3"
      data-narrowing-column={tone}
    >
      <div className={`flex items-baseline justify-between border-b pb-2 ${headerColor}`}>
        <span className="text-xs font-bold uppercase tracking-wider">
          {title}
        </span>
        <span className="text-[10px] text-slate-500 font-mono">{items.length}</span>
      </div>
      <div className="text-[10px] text-slate-500 -mt-1">{subtitle}</div>
      {items.length === 0 ? (
        <div className="text-xs text-slate-600 italic py-2">
          No items in this bucket.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
          {items.map((entry, i) => (
            <li
              key={i}
              data-narrowing-entry
              className="text-xs text-slate-300 px-2 py-1.5 rounded bg-slate-800/60 border border-slate-700/60"
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
        <div className="font-mono text-[11px] text-slate-200">
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
          <div className="text-[10px] text-rose-300 mt-0.5">
            {conflictLabels[entry.conflict_type] ?? entry.conflict_type}
          </div>
        )}
        {column === "narrow_away" && entry.reason && (
          <div className="text-[10px] text-amber-300 mt-0.5">
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
      <div className="font-mono text-[11px] text-slate-200">
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
        <div className="text-[10px] text-rose-300 mt-0.5">
          {conflictLabels[entry.conflict_type] ?? entry.conflict_type}
        </div>
      )}
      {column === "narrow_away" && entry.reason && (
        <div className="text-[10px] text-amber-300 mt-0.5">
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
