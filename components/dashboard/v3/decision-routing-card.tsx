"use client"

import { useCachedFetch } from "@/lib/use-cached-fetch"
import { ErrorCard, LoadingCard, Section, StaleIndicator } from "./card-shell"
import { accentByCategory, descriptorClass } from "./styles"

/**
 * Decision Routing — per-family verdict counts from the canonical
 * UnifiedConfidenceScorer.
 *
 * Source: /api/proxy/findings/decision-routing → backend's
 * UnifiedConfidenceScorer + thresholds.decide() for each finding,
 * bucketed by (family × DecisionOutcome). Same matrix that gates
 * real AWS mutations in unified/execution/pipeline.py — verdicts
 * here CANNOT drift from production decisions.
 *
 * Honest framing:
 *   - Caps at top-N findings by severity (default 30) due to scorer's
 *     per-resource graph cost. Card shows "scored / total" so partial
 *     coverage is visible, never hidden.
 *   - "Other" findings (resource types without a canonical remediation
 *     action mapping yet) are reported under unmapped_findings.
 *   - Most findings often land in MANUAL_REVIEW — that's the
 *     telemetry-coverage gate firing fail-closed when sparse evidence
 *     exists for the resource. Correct behavior, not a bug.
 */

type DecisionBucket = {
  AUTO_EXECUTE?: number
  CANARY_FIRST?: number
  REQUIRE_APPROVAL?: number
  MANUAL_REVIEW?: number
  BLOCK?: number
  EXCLUDE?: number
}

type DecisionRoutingResp = {
  total_findings?: number
  scored_count?: number
  unscored_count?: number
  unmapped_findings?: number
  score_failures?: number
  limit?: number
  scope?: { kind: "system" | "org"; system_name: string | null }
  by_family?: {
    permissions?: DecisionBucket
    network?: DecisionBucket
    data?: DecisionBucket
    other?: DecisionBucket
  }
  by_decision_total?: DecisionBucket
  blocking_reasons?: Record<string, number>
  blocked_total?: number
  supported_families?: string[]
  generated_at?: string
  error?: string
}

// Reason key → operator-readable label + actionable hint.
// Keys must match BLOCKING_REASON_BUCKETS in the backend module
// api/findings_decision_routing.py — adding a new bucket there
// without adding a label here surfaces the raw key in the UI as
// fallback (still honest, just less polished).
const BLOCKING_REASON_LABELS: Record<string, { label: string; hint: string }> = {
  low_telemetry_coverage: {
    label: "Low telemetry coverage",
    hint: "Enable CloudTrail / VPC Flow / Config to lift these out of manual",
  },
  short_observation_window: {
    label: "Short observation window",
    hint: "Resource is too new — wait for behavioral baseline to accumulate",
  },
  no_evidence_for_resource: {
    label: "No evidence collected",
    hint: "SignalSource has no data for this resource's account/region",
  },
  evidence_collection_pending: {
    label: "Evidence collection pending",
    hint: "Tracked source not yet synced; wait for next collection cycle",
  },
  low_quality_evidence: {
    label: "Degraded evidence quality",
    hint: "C_source confidence below 75 — investigate weakest source",
  },
  evidence_conflict_ct_vs_aa: {
    label: "CT vs Access Analyzer conflict",
    hint: "Hard binary disagreement — needs manual reconciliation",
  },
  implicit_dependency_unresolved: {
    label: "Implicit dependency uncertain",
    hint: "KMS / Secrets Manager dependency graph incomplete",
  },
  stale_analysis_hash: {
    label: "Stale analysis hash (drift)",
    hint: "Resource state changed since last collector sync — re-sync",
  },
  drift_unverifiable: {
    label: "Drift unverifiable",
    hint: "Analysis-time hash missing — never synced by collector",
  },
  flow_log_survival_check_failed: {
    label: "Flow log survival check failed",
    hint: "Preflight VPC Flow consistency gate fired",
  },
  simulation_failed: {
    label: "Simulation failed",
    hint: "iam:SimulatePrincipalPolicy errored — retry or escalate",
  },
  dr_breakglass_excluded: {
    label: "DR / break-glass tagged",
    hint: "Resource is intentionally excluded from automation",
  },
  other: {
    label: "Other gate",
    hint: "Unrecognized scorer gate — surface raw to product",
  },
}

const FAMILIES: Array<{
  key: "permissions" | "network" | "data"
  label: string
  accent: string
  pip: string
}> = [
  { key: "data", label: "Data", accent: accentByCategory.data, pip: "bg-teal-500" },
  { key: "permissions", label: "Permissions", accent: accentByCategory.permissions, pip: "bg-violet-500" },
  { key: "network", label: "Network", accent: accentByCategory.network, pip: "bg-blue-500" },
]

// Display order — most permissive (top of card) → most restrictive (bottom).
// Matches the matrix's _DECISION_ORDER in unified/scoring/thresholds.py.
const DECISION_DISPLAY: Array<{
  key: keyof DecisionBucket
  label: string
  toneClass: string
}> = [
  { key: "AUTO_EXECUTE", label: "Auto", toneClass: "text-emerald-700" },
  { key: "CANARY_FIRST", label: "Canary", toneClass: "text-emerald-600" },
  { key: "REQUIRE_APPROVAL", label: "Approval", toneClass: "text-amber-700" },
  { key: "MANUAL_REVIEW", label: "Manual", toneClass: "text-amber-600" },
  { key: "BLOCK", label: "Block", toneClass: "text-rose-600" },
]

function familyTotal(b: DecisionBucket | undefined): number {
  if (!b) return 0
  return DECISION_DISPLAY.reduce((sum, { key }) => sum + (b[key] ?? 0), 0)
}

function FamilyColumn({
  label,
  pip,
  accent,
  bucket,
}: {
  label: string
  pip: string
  accent: string
  bucket: DecisionBucket | undefined
}) {
  const total = familyTotal(bucket)
  return (
    <div className={`rounded-md border border-slate-200 bg-white p-3 ${accent}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          <span className={`inline-block h-2 w-2 rounded-full ${pip}`} />
          {label}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-slate-500">
          {total}
        </span>
      </div>
      {total === 0 ? (
        <div className="text-xs text-slate-400">No findings scored</div>
      ) : (
        <div className="space-y-1">
          {DECISION_DISPLAY.map(({ key, label: dLabel, toneClass }) => {
            const n = bucket?.[key] ?? 0
            if (n === 0) return null
            return (
              <div
                key={key}
                className="flex items-center justify-between text-[12px]"
              >
                <span className="text-slate-700">{dLabel}</span>
                <span className={`font-mono font-semibold tabular-nums ${toneClass}`}>
                  {n}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Render in two modes:
 *   - default (no `systemName`): org-wide aggregate, used by Home V3
 *   - `systemName="X"`: filters findings to one system, used by the
 *     System Detail page. Same backend endpoint with ?system_name=X.
 *
 * The card auto-detects which mode it's in from the response's `scope`
 * metadata so the descriptor reads "for X" when scoped.
 */
export function DecisionRoutingCard({ systemName }: { systemName?: string } = {}) {
  const url = systemName
    ? `/api/proxy/findings/decision-routing?limit=30&system_name=${encodeURIComponent(systemName)}`
    : "/api/proxy/findings/decision-routing?limit=30"
  const cacheKey = systemName
    ? `decision-routing-30-sys-${systemName}`
    : "decision-routing-30"

  const { data, loading, error, retry, isStale, cachedAt } =
    useCachedFetch<DecisionRoutingResp>(url, {
      cacheKey,
      // Backend caches 5min; proxy caches 5min; longer browser
      // freshness is fine here because matrix verdicts shift slowly.
      maxStaleMs: 30 * 60 * 1000,
      fetchInit: { cache: "no-store" },
    })

  if (loading && !data) return <LoadingCard label="Decision routing per family" />
  if (error && !data)
    return (
      <ErrorCard label="Decision routing per family" error={error} onRetry={retry} />
    )
  if (!data) return null

  const total = data.total_findings ?? 0
  const scored = data.scored_count ?? 0
  const unmapped = data.unmapped_findings ?? 0
  const limit = data.limit ?? 30
  const partial = total > scored
  const scopedTo =
    data.scope?.kind === "system" && data.scope.system_name
      ? data.scope.system_name
      : null
  const scopeSuffix = scopedTo ? ` for ${scopedTo}` : ""

  return (
    <Section
      label={scopedTo ? `Decision routing · ${scopedTo}` : "Decision routing"}
      descriptor={
        scored === 0
          ? `No findings scored yet${scopeSuffix}`
          : partial
            ? `Top ${scored} of ${total} findings scored${scopeSuffix} (capped at ${limit})${
                unmapped > 0 ? ` · ${unmapped} unmapped` : ""
              }`
            : `${scored} findings scored${scopeSuffix}${
                unmapped > 0 ? ` · ${unmapped} unmapped` : ""
              }`
      }
      className="border-l-[3px] border-l-indigo-500"
      right={<StaleIndicator cachedAt={cachedAt} isStale={isStale} />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {FAMILIES.map(({ key, label, accent, pip }) => (
          <FamilyColumn
            key={key}
            label={label}
            pip={pip}
            accent={accent}
            bucket={data.by_family?.[key]}
          />
        ))}
      </div>

      {/* Why Cyntro Is Not Acting Yet — bucketed gates from the scorer.
          Renders only when there are blocked findings to explain.
          The breakdown is the operator-grade version of the bare BLOCK
          count: instead of "9 blocked", show what would unblock them
          (enable telemetry, wait for observation window, resolve
          conflict, etc.). Each entry is one gate type that fired. */}
      {data.blocking_reasons &&
        Object.keys(data.blocking_reasons).length > 0 && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/50 p-3">
            <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
              Why Cyntro is not acting yet
              <span className="font-mono text-[10px] tabular-nums text-amber-600">
                · {data.blocked_total ?? 0} blocked
              </span>
            </div>
            <ul className="space-y-1">
              {Object.entries(data.blocking_reasons)
                .sort(([, a], [, b]) => b - a)
                .map(([key, count]) => {
                  const meta = BLOCKING_REASON_LABELS[key] ?? {
                    label: key,
                    hint: "Unrecognized gate — see backend module",
                  }
                  return (
                    <li
                      key={key}
                      className="flex items-baseline justify-between gap-3 text-[12px]"
                    >
                      <span className="text-slate-700">
                        <span className="font-semibold">{meta.label}</span>
                        <span className="ml-2 text-slate-500">— {meta.hint}</span>
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-amber-700">
                        {count}
                      </span>
                    </li>
                  )
                })}
            </ul>
          </div>
        )}

      <p className={`${descriptorClass} mt-3`}>
        Verdicts from the unified scorer (Patent A4 matrix) — same logic that
        gates real AWS mutations. Most findings land in Manual / Approval when
        telemetry coverage is sparse; this is the fail-closed gate, not a bug.
      </p>
    </Section>
  )
}
