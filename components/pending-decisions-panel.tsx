"use client"

/**
 * PendingDecisionsPanel — replaces the legacy "Immediate Priorities"
 * panel on the System Detail Overview tab.
 *
 * Naming maps to ``unified.DecisionOutcome`` — under current routing
 * thresholds (APPROVAL=0.10 demo, ≥0.50 prod) most findings land in
 * REQUIRE_APPROVAL, so the panel surfaces the queue of decisions the
 * scorer has already routed and is waiting on a human for. "Suggested
 * Next Actions" was advisory framing; this is the decision queue.
 *
 * v1 Tier-2 capability per the design audit:
 *   - Simulate button opens the existing SimulateFixModal which fires
 *     /api/iam-roles/{role}/gap-analysis (or the SG/S3 equivalent in
 *     follow-ups), renders inline preview, and gates Apply behind
 *     explicit operator click.
 *   - Apply still goes through ``UnifiedPipeline.execute()`` so
 *     simulate→snapshot→canary→validate→full and the full set of
 *     safety gates fire.
 *
 * v1 candidate set (per design lock):
 *   - IAMRole findings → "Remove unused permissions"
 *   - SecurityGroup findings → "Tighten ingress rules"
 *   - S3Bucket findings with public-access language → "Block public access"
 * Skip everything else; deletion-class actions (drop bucket / drop SG /
 * drop role) are explicitly out of scope to preserve "Cyntro narrows,
 * never deletes" framing.
 *
 * No fabricated data. The action verb per row is derived from the
 * real ``resourceType`` + finding text; the simulate flow uses the
 * existing real-data endpoints, no mocks.
 */

import { useMemo, useState } from "react"
import { CheckCircle, ShieldAlert, Network, Database, ShieldCheck } from "lucide-react"
import type { SecurityFinding } from "@/lib/types"
import { SimulateFixModal } from "@/components/SimulateFixModal"

interface PendingDecision {
  finding: SecurityFinding
  actionVerb: string
  Icon: typeof ShieldCheck
  iconBg: string
  iconColor: string
  // Severity tone for the left border bar.
  borderClass: string
}

interface PendingDecisionsPanelProps {
  systemName?: string
  findings: SecurityFinding[]
  /** Fallback when the operator wants to leave the panel — opens the
   *  full Risk → Vulnerabilities tab. */
  onOpenFullQueue?: () => void
  /** Cap how many decisions render inline. Older items still
   *  reachable via the full queue. */
  maxVisible?: number
}

function classify(finding: SecurityFinding): PendingDecision | null {
  const rt = (finding as any).resourceType ?? (finding as any).resource_type ?? ""
  const text = `${finding.title ?? ""} ${finding.description ?? ""}`.toLowerCase()
  const severity = (finding.severity ?? "medium").toLowerCase()
  const borderClass =
    severity === "critical"
      ? "border-l-[#ef4444]"
      : severity === "high"
        ? "border-l-[#f97316]"
        : severity === "medium"
          ? "border-l-[#eab308]"
          : "border-l-slate-300"

  if (rt === "IAMRole") {
    return {
      finding,
      actionVerb: "Remove unused permissions",
      Icon: ShieldCheck,
      iconBg: "bg-[#3b82f615]",
      iconColor: "text-[#3b82f6]",
      borderClass,
    }
  }
  if (rt === "SecurityGroup") {
    // "Tighten ingress rules" covers the SG_RULE_DELETE + SG_RULE_TIGHTEN
    // unified-pipeline actions. Don't differentiate at this level — the
    // simulate modal will surface the specific rules involved.
    return {
      finding,
      actionVerb: "Tighten ingress rules",
      Icon: Network,
      iconBg: "bg-[#8b5cf615]",
      iconColor: "text-[#8b5cf6]",
      borderClass,
    }
  }
  if (rt === "S3Bucket") {
    // Only S3_BLOCK_PUBLIC for v1 — safer than policy edit. Surface
    // only when the finding actually concerns public exposure; a
    // bucket finding about encryption or replication is out of scope
    // here.
    if (
      text.includes("public") ||
      text.includes("0.0.0.0") ||
      text.includes("expos")
    ) {
      return {
        finding,
        actionVerb: "Block public access",
        Icon: Database,
        iconBg: "bg-[#10b98115]",
        iconColor: "text-[#10b981]",
        borderClass,
      }
    }
  }
  return null
}

export function PendingDecisionsPanel({
  systemName,
  findings,
  onOpenFullQueue,
  maxVisible = 3,
}: PendingDecisionsPanelProps) {
  const [openFor, setOpenFor] = useState<SecurityFinding | null>(null)

  const decisions = useMemo(
    () =>
      findings
        .map(classify)
        .filter((d): d is PendingDecision => d !== null)
        .slice(0, maxVisible),
    [findings, maxVisible],
  )
  const totalActionable = useMemo(
    () => findings.map(classify).filter((d) => d !== null).length,
    [findings],
  )

  return (
    <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-[#ef4444]" />
          <h3 className="text-lg font-semibold text-[var(--foreground,#111827)]">
            Pending Decisions
          </h3>
        </div>
        {totalActionable > maxVisible ? (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground,#6b7280)]">
            {decisions.length} of {totalActionable}
          </span>
        ) : null}
      </div>

      {decisions.length === 0 ? (
        <div className="rounded-lg border border-[#22c55e30] bg-[#22c55e08] p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-[#22c55e] mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[#166534]">
                No decisions waiting
              </p>
              <p className="text-xs text-[var(--muted-foreground,#6b7280)] mt-1">
                Findings the engine routes for human review will appear here.
                Currently the queue is empty for this system.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {decisions.map((d) => {
            const ActionIcon = d.Icon
            const resourceId =
              (d.finding as any).resourceId ??
              (d.finding as any).resource_id ??
              "unknown resource"
            return (
              <div
                key={d.finding.id ?? `${resourceId}-${d.actionVerb}`}
                className={`rounded-lg border-l-4 ${d.borderClass} border-y border-r border-[var(--border,#e5e7eb)] bg-white p-4`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-md ${d.iconBg} shrink-0`}>
                    <ActionIcon className={`w-4 h-4 ${d.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--foreground,#111827)]">
                      {d.actionVerb}
                    </p>
                    <p
                      className="mt-0.5 text-xs text-[var(--muted-foreground,#6b7280)] truncate"
                      title={resourceId}
                    >
                      {resourceId}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--muted-foreground,#9ca3af)]">
                      {(d.finding.severity ?? "").toString().toUpperCase()}
                      {d.finding.title ? ` · ${d.finding.title}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setOpenFor(d.finding)}
                    className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-[#2D51DA] hover:bg-[#2343B8] transition-colors"
                  >
                    Simulate →
                  </button>
                </div>
              </div>
            )
          })}
          {totalActionable > maxVisible && onOpenFullQueue ? (
            <button
              onClick={onOpenFullQueue}
              className="w-full rounded-md border border-[var(--border,#e5e7eb)] bg-slate-50 px-3 py-2 text-xs font-medium text-[var(--muted-foreground,#6b7280)] hover:bg-slate-100"
            >
              {totalActionable - maxVisible} more pending — open the full queue →
            </button>
          ) : null}
        </div>
      )}

      <SimulateFixModal
        isOpen={openFor !== null}
        onClose={() => setOpenFor(null)}
        finding={openFor ?? undefined}
      />
    </div>
  )
}
