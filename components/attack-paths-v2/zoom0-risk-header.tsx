"use client"

/**
 * Zoom0 shared risk header — answers state / top risk / mitigation
 * without requiring a details panel. Data must come from backend
 * risk_summary (server-ranked); FE must not invent "worst of N".
 */

import { AlertTriangle, Shield } from "lucide-react"
import type { JewelRiskSummary, PathRiskRef } from "@/lib/attack-paths/convergence-types"

function evidenceLabel(evidence: string | undefined): string {
  switch (evidence) {
    case "observed":
      return "Observed"
    case "configured":
      return "Configured"
    case "unverified":
      return "Unverified"
    case "blocked":
      return "Blocked"
    default:
      // AP201 (I1): an absent or unrecognised evidence word is not "Configured".
      return "Not reported"
  }
}

function refHeadline(ref: PathRiskRef | null | undefined, fallback: string): string {
  return (
    ref?.impact_headline?.trim() ||
    ref?.business_sentence?.trim() ||
    fallback
  )
}

export function Zoom0RiskHeader({
  risk,
  onMitigate,
}: {
  risk: JewelRiskSummary
  /** Optional: open LP / break-path for the ranked identity. */
  onMitigate?: () => void
}) {
  const notReady =
    risk.serve_state === "NOT_READY" || risk.coverage_state === "NOT_READY"
  const top = risk.top_risk
  const current = risk.current_state
  const stateEvidence = current?.evidence ?? risk.evidence
  const evidenceLive = stateEvidence === "observed"
  // AP201 (I1): the headline and the mitigation are the server's or absent. "Configured path risk" and "Tighten
  // least-privilege for the path identity" were invented here when the server sent none.
  const headline = refHeadline(
    top,
    risk.impact_headline?.trim() || risk.business_sentence?.trim() || "",
  )
  const mitigation =
    top?.mitigation_hint?.trim() || risk.mitigation_hint?.trim() || null
  const identityName = top?.identity_name ?? risk.identity_name
  const severity = top?.severity_label ?? risk.severity_label
  // AP201 (C1): a served risk_summary may carry no damage_types at all; absent is an empty list, never a throw.
  const damage: string[] = Array.isArray(top?.damage_types) && top.damage_types.length
    ? top.damage_types
    : Array.isArray(risk.damage_types)
      ? risk.damage_types
      : []
  const business =
    top?.business_sentence?.trim() || risk.business_sentence?.trim() || null
  const impact = top?.impact_headline?.trim() || risk.impact_headline?.trim() || null

  if (notReady) {
    return (
      <div
        className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10"
        data-testid="zoom0-risk-header"
        data-serve-state="NOT_READY"
        data-coverage-state={risk.coverage_state ?? "NOT_READY"}
      >
        <p className="text-[13px] font-medium text-amber-900 dark:text-amber-100">
          Risk summary not ready
        </p>
        <p className="mt-0.5 text-[11px] text-amber-800/80 dark:text-amber-200/80">
          Live attack-path materialization is missing or stale for this system.
          Wait for the next projection — do not treat an empty map as safe.
        </p>
      </div>
    )
  }

  return (
    <div
      className="rounded-lg border border-border bg-muted/30 px-3 py-2.5"
      data-testid="zoom0-risk-header"
      data-evidence={stateEvidence}
      data-serve-state={risk.serve_state ?? undefined}
      data-coverage-state={risk.coverage_state ?? undefined}
      data-generation={risk.generation ?? undefined}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-muted-foreground">
        <span
          className={
            evidenceLive
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-slate-600 dark:text-slate-400"
          }
        >
          {evidenceLabel(stateEvidence)} · current state
        </span>
        {top && current && top.path_id !== current.path_id ? (
          <span className="text-rose-700 dark:text-rose-300">
            Top risk · {evidenceLabel(top.evidence)}
          </span>
        ) : (
          <span>Top risk · {evidenceLabel(top?.evidence ?? risk.evidence)}</span>
        )}
        <span>
          {risk.observed_paths} observed · {risk.configured_paths} configured
          {(risk.unverified_paths ?? 0) > 0
            ? ` · ${risk.unverified_paths} unverified`
            : ""}
        </span>
        {severity ? (
          <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
            <AlertTriangle className="h-3 w-3" />
            {severity}
          </span>
        ) : null}
        {risk.coverage_state && risk.coverage_state !== "READY" ? (
          <span className="text-amber-700 dark:text-amber-400">
            {risk.coverage_state}
          </span>
        ) : null}
        {risk.as_of ? <span title="as_of">as of {risk.as_of}</span> : null}
      </div>

      {headline ? (
        <p className="mt-1.5 text-[13px] font-medium leading-snug text-foreground">
          {headline}
        </p>
      ) : (
        <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground" data-testid="zoom0-risk-headline-missing">
          Risk headline not reported by the server.
        </p>
      )}

      {business && impact && business !== impact ? (
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {business}
        </p>
      ) : null}

      {damage.length > 0 ? (
        <p className="mt-1 text-[10px] font-mono text-muted-foreground">
          {damage.slice(0, 4).join(" · ")}
          {damage.length > 4 ? ` · +${damage.length - 4}` : ""}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {onMitigate ? (
          // The affordance is the page's (open LP / break-path for the identity); only the hint text is the server's.
          <button
            type="button"
            onClick={onMitigate}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
            data-testid="zoom0-risk-mitigate"
            data-hint={mitigation ? "server" : "absent"}
          >
            <Shield className="h-3 w-3" />
            {mitigation ?? "Open mitigation"}
          </button>
        ) : mitigation ? (
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-rose-800 dark:text-rose-200"
            data-testid="zoom0-risk-mitigate-hint"
          >
            <Shield className="h-3 w-3" />
            {mitigation}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground" data-testid="zoom0-risk-mitigate-missing">
            No server-authored mitigation hint.
          </span>
        )}
        {identityName ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            via {identityName}
          </span>
        ) : null}
      </div>
    </div>
  )
}
