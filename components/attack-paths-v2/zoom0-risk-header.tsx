"use client"

/**
 * Zoom0 shared risk header — answers state / top risk / mitigation
 * without requiring a lens. Data must come from backend risk_summary
 * (server-ranked); FE must not invent "worst of N".
 */

import { AlertTriangle, Shield } from "lucide-react"
import type { JewelRiskSummary } from "@/lib/attack-paths/convergence-types"

export function Zoom0RiskHeader({
  risk,
  onMitigate,
}: {
  risk: JewelRiskSummary
  /** Optional: open LP / break-path for the ranked identity. */
  onMitigate?: () => void
}) {
  const evidenceLive = risk.evidence === "observed"
  const headline =
    risk.impact_headline?.trim() ||
    risk.business_sentence?.trim() ||
    "Configured path risk"
  const mitigation =
    risk.mitigation_hint?.trim() || "Tighten least-privilege for the path identity"

  return (
    <div
      className="rounded-lg border border-border bg-muted/30 px-3 py-2.5"
      data-testid="zoom0-risk-header"
      data-evidence={risk.evidence}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-muted-foreground">
        <span
          className={
            evidenceLive
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-slate-600 dark:text-slate-400"
          }
        >
          {evidenceLive ? "Observed" : "Configured"} · top path
        </span>
        <span>
          {risk.observed_paths} observed · {risk.configured_paths} configured
        </span>
        {risk.severity_label ? (
          <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
            <AlertTriangle className="h-3 w-3" />
            {risk.severity_label}
          </span>
        ) : null}
      </div>

      <p className="mt-1.5 text-[13px] font-medium leading-snug text-foreground">
        {headline}
      </p>

      {risk.business_sentence &&
      risk.impact_headline &&
      risk.business_sentence.trim() !== risk.impact_headline.trim() ? (
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {risk.business_sentence}
        </p>
      ) : null}

      {risk.damage_types.length > 0 ? (
        <p className="mt-1 text-[10px] font-mono text-muted-foreground">
          {risk.damage_types.slice(0, 4).join(" · ")}
          {risk.damage_types.length > 4
            ? ` · +${risk.damage_types.length - 4}`
            : ""}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {onMitigate ? (
          <button
            type="button"
            onClick={onMitigate}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
            data-testid="zoom0-risk-mitigate"
          >
            <Shield className="h-3 w-3" />
            {mitigation}
          </button>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-rose-800 dark:text-rose-200"
            data-testid="zoom0-risk-mitigate-hint"
          >
            <Shield className="h-3 w-3" />
            {mitigation}
          </span>
        )}
        {risk.identity_name ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            via {risk.identity_name}
          </span>
        ) : null}
      </div>
    </div>
  )
}
