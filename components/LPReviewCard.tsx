"use client"

import { useState } from "react"
import {
  Shield, ShieldCheck, AlertTriangle, XCircle, CheckCircle2, Clock,
  Loader2, ChevronDown, ChevronUp, Info, Zap, Lock,
} from "lucide-react"
import type { DecisionOutcomeCanonical } from "@/lib/types"

// ─────────────────────────────────────────────────────────────────────────────
// LPReviewCard
// One-screen "Review" card for the Least Privilege tab. Replaces the older
// 6-section sprawl (LP Violation banner + Over-Privileged stats + Pipeline
// Decision banner + Confidence Scorer panel + Service Role warning + Recommended
// Action) with five well-defined zones:
//
//   1. Header        — identity + canonical score (over-privileged %) + tier chip
//   2. Why this score — plain language, zero provider names
//   3. What we narrow — kept-vs-removable bar + sample permissions
//   4. What stays    — categorical reasons (used / risky / protected / unobserved)
//   5. Decision row  — Approve · Simulate · Extend observation · Reject
//
// Copy rules (enforced here, not by reviewer):
//  - never say "CloudTrail", "VPC Flow", "Neo4j", "API events", "AWS API"
//  - "we observed", "in use", "exercised" are fine
//  - exactly one canonical score on screen — over-privileged %
//  - the decision tier comes verbatim from the unified pipeline (DecisionOutcomeCanonical)
// ─────────────────────────────────────────────────────────────────────────────

export interface LPReviewCardProps {
  // Identity
  roleName: string
  identityType?: string
  systemName?: string

  // Numbers
  observationDays: number
  totalPermissions: number
  usedCount: number
  unusedCount: number
  removableCount: number
  protectedCount: number
  warnCount: number

  // Sampling — short lists for evidence panels
  removableSamples?: string[]
  keptSamples?: string[]

  // Decision (from /simulate-fix safety object)
  decision: DecisionOutcomeCanonical | null
  unsafeReasons?: string[]
  consumerCount?: number
  telemetryCoverage?: number | null
  completeness?: "complete" | "partial" | "unknown" | null

  // Service-role lock (a hard "do not modify" — sourced from trust policy)
  isServiceRoleLocked?: boolean
  serviceRoleSummary?: string | null

  // State
  loading?: boolean
  busyApprove?: boolean
  busySimulate?: boolean
  busyExtend?: boolean

  // Actions
  onApprove: () => void
  onSimulate: () => void
  onExtendObservation: (days: 90 | 180 | 365) => void
  onReject?: () => void
}

type Tone = "auto" | "approve" | "review" | "block"

const TONE_STYLES: Record<Tone, { fg: string; bg: string; border: string; chip: string }> = {
  auto:    { fg: "#166534", bg: "#f0fdf4", border: "#86efac", chip: "#16a34a" },
  approve: { fg: "#92400e", bg: "#fffbeb", border: "#fcd34d", chip: "#d97706" },
  review:  { fg: "#9a3412", bg: "#fff7ed", border: "#fdba74", chip: "#ea580c" },
  block:   { fg: "#991b1b", bg: "#fef2f2", border: "#fca5a5", chip: "#dc2626" },
}

function decisionToTone(d: DecisionOutcomeCanonical | null): Tone {
  if (!d) return "review"
  if (d === "AUTO_EXECUTE") return "auto"
  if (d === "BLOCK" || d === "EXCLUDE") return "block"
  if (d === "MANUAL_REVIEW") return "review"
  return "approve" // REQUIRE_APPROVAL | CANARY_FIRST
}

function tierLabel(d: DecisionOutcomeCanonical | null) {
  switch (d) {
    case "AUTO_EXECUTE":     return "Safe to apply"
    case "REQUIRE_APPROVAL": return "Approval required"
    case "CANARY_FIRST":     return "Canary first"
    case "MANUAL_REVIEW":    return "Manual review"
    case "BLOCK":            return "Blocked"
    case "EXCLUDE":          return "Excluded"
    default:                 return "Pending"
  }
}

// Plain-language one-liner per tier. Never names data providers.
function tierHeadline(d: DecisionOutcomeCanonical | null, consumers: number, locked: boolean) {
  if (locked) return "This identity is bound to a managed service. Cyntro will not narrow it."
  switch (d) {
    case "AUTO_EXECUTE":
      return "Cyntro can narrow this safely. No service disruption expected."
    case "REQUIRE_APPROVAL":
      return "The narrowing is high-confidence. Approval is policy — sign off to apply."
    case "CANARY_FIRST":
      return "Cyntro will validate the change against a runtime canary before enforcing it."
    case "MANUAL_REVIEW":
      return consumers > 0
        ? `Evidence is partial and ${consumers} other system${consumers === 1 ? "" : "s"} depend on this identity. Review before acting.`
        : "Evidence is partial. Review the examples below before acting."
    case "BLOCK":
    case "EXCLUDE":
      return "Cyntro will not narrow this identity. See the reason below."
    default:
      return "Pending evidence. Cyntro is still gathering signal."
  }
}

// "Why this score" copy — assembled from observation + completeness, no providers.
function whyThisScore(opts: {
  observationDays: number
  total: number
  used: number
  completeness: LPReviewCardProps["completeness"]
}) {
  const { observationDays, total, used, completeness } = opts
  const lead = `Over ${observationDays} days, ${used.toLocaleString()} of ${total.toLocaleString()} granted permissions were actually exercised.`
  if (completeness === "complete") {
    return `${lead} Coverage is complete — every permission either fired or had the chance to.`
  }
  if (completeness === "partial") {
    return `${lead} Coverage is partial — some activity types are not yet visible, so a small number of "unused" permissions may still be needed.`
  }
  if (completeness === "unknown") {
    return `${lead} Coverage is uncertain — extend the observation window before approving aggressive narrowing.`
  }
  return lead
}

export function LPReviewCard(props: LPReviewCardProps) {
  const {
    roleName, identityType = "IAMRole", systemName,
    observationDays, totalPermissions, usedCount, unusedCount,
    removableCount, protectedCount, warnCount,
    removableSamples = [], keptSamples = [],
    decision, unsafeReasons = [], consumerCount = 0,
    telemetryCoverage, completeness,
    isServiceRoleLocked = false, serviceRoleSummary,
    loading, busyApprove, busySimulate, busyExtend,
    onApprove, onSimulate, onExtendObservation, onReject,
  } = props

  const [extendOpen, setExtendOpen] = useState(false)
  const [showAllReasons, setShowAllReasons] = useState(false)

  // Headline metric: over-privileged % (canonical score for this card)
  const overPriv = totalPermissions > 0 ? Math.round((unusedCount / totalPermissions) * 100) : 0
  const usedPct  = totalPermissions > 0 ? Math.round((usedCount   / totalPermissions) * 100) : 0
  const removablePct = totalPermissions > 0 ? Math.round((removableCount / totalPermissions) * 100) : 0

  const tone = isServiceRoleLocked ? "block" : decisionToTone(decision)
  const s = TONE_STYLES[tone]
  const headline = tierHeadline(decision, consumerCount, isServiceRoleLocked)
  const showExtend =
    isServiceRoleLocked === false && (
      decision === "BLOCK" ||
      decision === "MANUAL_REVIEW" ||
      completeness === "partial" ||
      completeness === "unknown"
    )

  // "Stays" reason chips — only render the buckets that have count > 0.
  const stayChips: Array<{ label: string; count: number; color: string; bg: string; icon: React.ReactNode }> = [
    { label: "actively used",        count: usedCount,      color: "#166534", bg: "#dcfce7", icon: <CheckCircle2 className="w-3 h-3" /> },
    { label: "risky to remove",      count: warnCount,      color: "#9a3412", bg: "#ffedd5", icon: <AlertTriangle className="w-3 h-3" /> },
    { label: "protected",            count: protectedCount, color: "#991b1b", bg: "#fee2e2", icon: <Lock className="w-3 h-3" /> },
  ].filter(c => c.count > 0)

  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-8 flex items-center justify-center" style={{ borderColor: "var(--border, #e5e7eb)" }}>
        <Loader2 className="w-5 h-5 animate-spin text-slate-400 mr-2" />
        <span className="text-sm text-slate-500">Reviewing this identity…</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ── Zone 1: Header ─────────────────────────────────────────────── */}
      <div
        className="rounded-lg border p-4"
        style={{ borderColor: s.border, background: s.bg }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: s.fg }}>
              LP Review
            </div>
            <div className="mt-0.5 text-sm font-semibold truncate" style={{ color: "var(--foreground, #111827)" }}>
              {roleName}
              <span className="font-normal" style={{ color: "var(--muted-foreground, #6b7280)" }}>
                {" · "}{identityType}{systemName ? ` · ${systemName}` : ""}
              </span>
            </div>
            <p className="mt-2 text-sm leading-snug" style={{ color: s.fg }}>
              {headline}
            </p>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <div className="text-3xl font-semibold tabular-nums leading-none" style={{ color: s.chip }}>
              {overPriv}%
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wide mt-1" style={{ color: s.chip }}>
              over-privileged
            </div>
            <span
              className="mt-2 px-2 py-0.5 rounded text-[10px] font-semibold uppercase whitespace-nowrap"
              style={{ background: s.chip, color: "#ffffff" }}
            >
              {tierLabel(decision)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Zone 2: Why this score ─────────────────────────────────────── */}
      <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--border, #e5e7eb)" }}>
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Why this score
          </span>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--foreground, #1f2937)" }}>
          {whyThisScore({ observationDays, total: totalPermissions, used: usedCount, completeness })}
        </p>
        {typeof telemetryCoverage === "number" && telemetryCoverage < 1 && (
          <p className="mt-2 text-xs text-slate-500">
            Visibility on this identity:{" "}
            <span className="font-semibold" style={{ color: "var(--foreground, #111827)" }}>
              {Math.round(telemetryCoverage * 100)}%
            </span>{" "}
            — {Math.round(telemetryCoverage * 100) >= 80
              ? "high enough to act on."
              : "extend the observation window for stronger evidence."}
          </p>
        )}
      </div>

      {/* ── Zone 3: What we'll remove ──────────────────────────────────── */}
      {totalPermissions > 0 && (
        <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                What Cyntro will narrow
              </span>
            </div>
            <span className="text-xs tabular-nums" style={{ color: "var(--muted-foreground, #6b7280)" }}>
              {removableCount} of {totalPermissions}
            </span>
          </div>

          <div className="flex items-center gap-0.5 h-2 rounded-full overflow-hidden" style={{ background: "#e5e7eb" }}>
            <div className="h-full" style={{ width: `${usedPct}%`, background: "#22c55e" }} />
            <div className="h-full" style={{ width: `${removablePct}%`, background: "#ef4444" }} />
          </div>
          <div className="flex items-center gap-3 mt-2 text-[11px]">
            <span className="flex items-center gap-1 text-emerald-700">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="tabular-nums">{usedCount}</span> kept (in use)
            </span>
            <span className="flex items-center gap-1 text-red-700">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
              <span className="tabular-nums">{removableCount}</span> removable
            </span>
            <span className="ml-auto text-slate-400 tabular-nums">{totalPermissions} total</span>
          </div>

          {(removableSamples.length > 0 || keptSamples.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              {keptSamples.length > 0 && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">
                    Sample kept
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {keptSamples.slice(0, 4).map((p, i) => (
                      <span key={`k-${i}`} className="px-1.5 py-0.5 bg-white border border-emerald-200 rounded text-[10px] font-mono text-emerald-900">
                        {p}
                      </span>
                    ))}
                    {keptSamples.length > 4 && (
                      <span className="text-[10px] text-emerald-700">+{keptSamples.length - 4} more</span>
                    )}
                  </div>
                </div>
              )}
              {removableSamples.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50/60 p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-red-700 mb-1">
                    Sample removed
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {removableSamples.slice(0, 4).map((p, i) => (
                      <span key={`r-${i}`} className="px-1.5 py-0.5 bg-white border border-red-200 rounded text-[10px] font-mono text-red-900">
                        {p}
                      </span>
                    ))}
                    {removableSamples.length > 4 && (
                      <span className="text-[10px] text-red-700">+{removableSamples.length - 4} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Zone 4: Why the rest stays ─────────────────────────────────── */}
      {(stayChips.length > 0 || isServiceRoleLocked || unsafeReasons.length > 0) && (
        <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Why the rest stays
            </span>
          </div>

          {stayChips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {stayChips.map((c, i) => (
                <span
                  key={`stay-${i}`}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium"
                  style={{ background: c.bg, color: c.color }}
                >
                  {c.icon}
                  <span className="tabular-nums font-semibold">{c.count}</span>
                  <span>{c.label}</span>
                </span>
              ))}
            </div>
          )}

          {isServiceRoleLocked && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5">
              <div className="flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
                <div className="text-xs text-red-800 leading-snug">
                  <span className="font-semibold">Bound to a managed service. </span>
                  {serviceRoleSummary ?? "Removing permissions can break the service this identity supports."}
                </div>
              </div>
            </div>
          )}

          {unsafeReasons.length > 0 && (
            <div className="mt-3 text-xs text-slate-700 space-y-1">
              {(showAllReasons ? unsafeReasons : unsafeReasons.slice(0, 2)).map((r, i) => (
                <div key={`r-${i}`} className="flex items-start gap-2">
                  <span className="text-slate-400 mt-0.5">•</span>
                  <span>{r}</span>
                </div>
              ))}
              {unsafeReasons.length > 2 && (
                <button
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
                  onClick={() => setShowAllReasons(v => !v)}
                >
                  {showAllReasons ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showAllReasons ? "Show fewer" : `Show ${unsafeReasons.length - 2} more`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Zone 5: Decision row ───────────────────────────────────────── */}
      <div className="rounded-lg border bg-slate-50 p-3 flex flex-wrap items-center gap-2" style={{ borderColor: "var(--border, #e5e7eb)" }}>
        {!isServiceRoleLocked && (
          <button
            onClick={onApprove}
            disabled={busyApprove || tone === "block"}
            className="px-3 py-1.5 text-xs text-white rounded-md font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            style={{ background: tone === "block" ? "#94a3b8" : tone === "auto" ? "#16a34a" : "#2D51DA" }}
          >
            {busyApprove ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            {tone === "auto" ? "Approve & narrow" : "Approve"}
          </button>
        )}

        <button
          onClick={onSimulate}
          disabled={busySimulate}
          className="px-3 py-1.5 text-xs border rounded-md font-medium hover:bg-white flex items-center gap-1.5 disabled:opacity-40"
          style={{ borderColor: "var(--border, #e5e7eb)", color: "var(--foreground, #111827)" }}
        >
          {busySimulate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Simulate fix
        </button>

        {showExtend && (
          <div className="relative">
            <button
              onClick={() => setExtendOpen(v => !v)}
              disabled={busyExtend}
              className="px-3 py-1.5 text-xs border rounded-md font-medium hover:bg-white flex items-center gap-1.5 disabled:opacity-40"
              style={{ borderColor: "var(--border, #e5e7eb)", color: "var(--foreground, #111827)" }}
            >
              {busyExtend ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
              Extend observation
              <ChevronDown className="w-3 h-3" />
            </button>
            {extendOpen && (
              <div className="absolute left-0 mt-1 w-44 rounded-md border bg-white shadow-lg z-10" style={{ borderColor: "var(--border, #e5e7eb)" }}>
                {[
                  { d: 90  as const, label: "90 days"  },
                  { d: 180 as const, label: "6 months" },
                  { d: 365 as const, label: "1 year"   },
                ].map(opt => (
                  <button
                    key={opt.d}
                    onClick={() => { setExtendOpen(false); onExtendObservation(opt.d) }}
                    className="block w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50"
                    style={{ color: "var(--foreground, #111827)" }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {onReject && (
          <button
            onClick={onReject}
            className="ml-auto px-3 py-1.5 text-xs border rounded-md font-medium hover:bg-white flex items-center gap-1.5"
            style={{ borderColor: "var(--border, #e5e7eb)", color: "var(--muted-foreground, #6b7280)" }}
          >
            <XCircle className="w-3.5 h-3.5" />
            Reject
          </button>
        )}
      </div>
    </div>
  )
}

export default LPReviewCard
