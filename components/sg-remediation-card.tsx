"use client"

/**
 * SGRemediationCard — Security Group remediation card matching the IAM
 * permission analysis modal design language (confidence card + per-rule
 * action partition + bulk-select + dual-display reasons).
 *
 * Mirrors the locked v4.4 §11E pattern from iam-permission-analysis-modal:
 *   - Numeric confidence (0-100) drives 4-state routing
 *     (AUTO ≥ 0.90 / STAGED_AUTO 0.70 / SUGGEST 0.40 / INSUFFICIENT_DATA <0.40)
 *     SG thresholds per v4.4 table differ from IAM role thresholds.
 *   - Per-rule confidence partitions into safe_to_remove / verify_first /
 *     investigate_first / protected (rules referencing other SGs or with
 *     active traffic). _action derives from the per-rule score.
 *   - Demo-safe labels — "Connection observations" not "VPC Flow Logs".
 *   - One-click "Select all N in band" + Apply / Simulate at the bottom.
 *
 * Intentionally simpler than the IAM modal:
 *   - Inline card, not a modal overlay (SG rules don't have the
 *     two-view simulation flow IAM does).
 *   - No override-modal — operators flip the Apply switch and the
 *     existing /simulate endpoint stays the per-rule preview.
 *   - Snapshot/rollback UI lives elsewhere (existing sg-gap-card.tsx
 *     and the SG inspector sheet) for now.
 *
 * Data source: app/api/proxy/security-groups/[sgId]/rule-analysis/route.ts
 * (hits the real backend /api/security-groups/{sgId}/gap-analysis endpoint,
 * not the lossy /inspector-transform one at .../gap-analysis/).
 */

import React, { useEffect, useMemo, useState } from "react"

// ── Types ─────────────────────────────────────────────────────────

interface RuleTraffic {
  connection_count: number
  unique_sources?: string[]
  bytes_transferred?: number
  packets_transferred?: number
  last_seen?: string | null
}

interface RuleRecommendation {
  action: string // "review" | "delete" | "tighten" | "keep" (lower-case from backend)
  reason: string
  confidence: number // 0-100
  suggested_cidrs?: string[]
  observed_sources?: string[]
}

interface RuleAnalysis {
  rule_id: string
  direction: "inbound" | "outbound" | "ingress" | "egress"
  protocol: string
  port_range: string
  source: string
  destination: string
  description: string
  is_public: boolean
  traffic: RuleTraffic
  recommendation: RuleRecommendation
}

interface SGGapResponse {
  sg_id: string
  sg_name?: string
  vpc_id?: string
  observation_days?: number
  total_rules?: number
  used_rules?: number
  unused_rules?: number
  rules_analysis: RuleAnalysis[]
  error?: boolean
  message?: string
}

interface SGRemediationCardProps {
  sgId: string
  onSimulate?: (sgId: string, ruleId: string, action: string) => void
  onApply?: (sgId: string, ruleIds: string[]) => void
}

// ── Action partition (v4.4 §11E-style for SG rules) ───────────────
//
// SG rule confidence → _action mapping. Mirrors IAM's safe/verify/
// investigate partition but tuned for SG semantics:
//   - "protected": rule has active observed traffic, or references
//     another SG (could be load-balancer / control-plane wiring), or
//     is the special "default rule" pattern.
//   - "safe_to_remove": no traffic observed AND confidence ≥ 70.
//   - "verify_first": confidence 40-69 OR small traffic flicker.
//   - "investigate_first": confidence < 40 OR public-internet exposure
//     on a sensitive port (DB ports, SSH, etc.).
type RuleAction =
  | "safe_to_remove"
  | "verify_first"
  | "investigate_first"
  | "protected"

const SENSITIVE_PORTS = new Set([22, 3389, 3306, 5432, 27017, 6379, 9200, 11211])

function isSensitiveExposure(rule: RuleAnalysis): boolean {
  if (!rule.is_public) return false
  const m = /^(\d+)(?:-(\d+))?$/.exec(rule.port_range)
  if (!m) return false
  const lo = parseInt(m[1], 10)
  const hi = m[2] ? parseInt(m[2], 10) : lo
  for (const p of SENSITIVE_PORTS) {
    if (p >= lo && p <= hi) return true
  }
  return false
}

function classifyRule(rule: RuleAnalysis): RuleAction {
  // Source = other SG → "protected" (could be load-balancer wiring,
  // control-plane reference; don't auto-remove).
  if (rule.source?.startsWith("sg-")) return "protected"

  const conf = rule.recommendation?.confidence ?? 0
  const hasTraffic = (rule.traffic?.connection_count ?? 0) > 0
  const sensitive = isSensitiveExposure(rule)

  if (sensitive && hasTraffic) return "protected" // sensitive + used → don't touch
  if (sensitive) return "investigate_first" // sensitive + idle → still hand-review
  if (hasTraffic) return "verify_first" // some traffic; needs operator sanity check
  if (conf >= 70) return "safe_to_remove"
  if (conf >= 40) return "verify_first"
  return "investigate_first"
}

// ── Visual tokens (match IAM modal) ───────────────────────────────

const ACTION_STYLE: Record<
  RuleAction,
  { label: string; color: string; bg: string; border: string }
> = {
  safe_to_remove: {
    label: "Safe to remove",
    color: "#16a34a",
    bg: "#f0fdf4",
    border: "#bbf7d0",
  },
  verify_first: {
    label: "Verify first",
    color: "#d97706",
    bg: "#fff7ed",
    border: "#fed7aa",
  },
  investigate_first: {
    label: "Investigate first",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
  },
  protected: {
    label: "Protected",
    color: "#4b5563",
    bg: "#f3f4f6",
    border: "#e5e7eb",
  },
}

// ── v4.4 §11E SG thresholds (different from IAM role thresholds) ──

const T_AUTO = 90
const T_STAGED = 70
const T_SUGGEST = 40

interface RoutingState {
  name: string
  label: string
  blurb: string
  color: string
  bg: string
  border: string
  icon: string
}

function routingFromScore(score: number): RoutingState {
  if (score >= T_AUTO)
    return {
      name: "AUTO",
      label: "Ready for auto-execute",
      blurb:
        "Eligible for the full pipeline: snapshot → canary → staged → full rollout, no manual approval needed.",
      color: "#15803d",
      bg: "#f0fdf4",
      border: "#bbf7d0",
      icon: "✓",
    }
  if (score >= T_STAGED)
    return {
      name: "STAGED_AUTO",
      label: "Canary + staged auto",
      blurb:
        "Eligible for canary and staged rollout. Full rollout requires human approval.",
      color: "#1e40af",
      bg: "#eff6ff",
      border: "#bfdbfe",
      icon: "◐",
    }
  if (score >= T_SUGGEST)
    return {
      name: "SUGGEST",
      label: "Suggested — needs approval",
      blurb:
        "Recommendation queued for human approval. No execution without sign-off.",
      color: "#9a3412",
      bg: "#fff7ed",
      border: "#fed7aa",
      icon: "⚠",
    }
  return {
    name: "INSUFFICIENT_DATA",
    label: "Not enough data to remediate safely",
    blurb:
      "Security Group visible but Cyntro lacks the evidence to act. Improve coverage or override.",
    color: "#991b1b",
    bg: "#fef2f2",
    border: "#fecaca",
    icon: "⊘",
  }
}

// ── Component ──────────────────────────────────────────────────────

export function SGRemediationCard({
  sgId,
  onSimulate,
  onApply,
}: SGRemediationCardProps) {
  const [data, setData] = useState<SGGapResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    fetch(`/api/proxy/security-groups/${sgId}/rule-analysis`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d: SGGapResponse) => {
        if (cancelled) return
        if (d?.error) setErr(d.message || "Backend error")
        setData(d)
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message || "Network error")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sgId])

  // ── Bucket rules + aggregate score ─────────────────────────────
  const buckets = useMemo(() => {
    const out: Record<RuleAction, RuleAnalysis[]> = {
      safe_to_remove: [],
      verify_first: [],
      investigate_first: [],
      protected: [],
    }
    if (!data?.rules_analysis) return out
    for (const r of data.rules_analysis) {
      out[classifyRule(r)].push(r)
    }
    return out
  }, [data])

  const overallScore = useMemo(() => {
    if (!data?.rules_analysis?.length) return 0
    const remediable = data.rules_analysis.filter(
      (r) => classifyRule(r) !== "protected",
    )
    if (!remediable.length) return 0
    const sum = remediable.reduce(
      (acc, r) => acc + (r.recommendation?.confidence ?? 0),
      0,
    )
    return Math.round(sum / remediable.length)
  }, [data])

  const routing = useMemo(() => routingFromScore(overallScore), [overallScore])

  const toggleRule = (ruleId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(ruleId)) next.delete(ruleId)
      else next.add(ruleId)
      return next
    })
  }

  const selectBucket = (rules: RuleAnalysis[]) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const r of rules) next.add(r.rule_id)
      return next
    })
  }

  const clearSelection = () => setSelected(new Set())

  // ── Loading / Error ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 rounded-xl border border-[var(--border,#e5e7eb)] bg-[var(--card,#ffffff)] text-sm text-[var(--muted-foreground,#6b7280)]">
        Loading rule analysis for {sgId}…
      </div>
    )
  }

  if (err || !data) {
    return (
      <div className="p-6 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
        Failed to load {sgId}: {err || "no data"}
      </div>
    )
  }

  const totalRemediable =
    buckets.safe_to_remove.length +
    buckets.verify_first.length +
    buckets.investigate_first.length

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-[var(--border,#e5e7eb)] bg-[var(--card,#ffffff)] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border,#e5e7eb)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground,#6b7280)]">
              Security Group
            </div>
            <div className="text-xl font-bold mt-0.5 text-[var(--foreground,#111827)] truncate">
              {data.sg_name || data.sg_id}
            </div>
            <div className="text-xs font-mono text-[var(--muted-foreground,#6b7280)] mt-0.5">
              {data.sg_id}
              {data.vpc_id ? ` · ${data.vpc_id}` : ""}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground,#6b7280)]">
              Rules
            </div>
            <div className="text-2xl font-bold tabular-nums text-[var(--foreground,#111827)]">
              {data.total_rules ?? data.rules_analysis.length}
            </div>
            <div className="text-xs text-[var(--muted-foreground,#6b7280)]">
              {data.observation_days
                ? `${data.observation_days}d observation`
                : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Confidence card (mirror IAM renderConfidenceCard) */}
      <div className="p-4">
        <div
          className="p-4 rounded-xl border-2"
          style={{ backgroundColor: routing.bg, borderColor: routing.border }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div
                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: routing.color, opacity: 0.8 }}
              >
                Confidence
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span
                  className="text-5xl font-bold tabular-nums leading-none"
                  style={{ color: routing.color }}
                >
                  {overallScore}
                </span>
                <span
                  className="text-base"
                  style={{ color: routing.color, opacity: 0.7 }}
                >
                  / 100
                </span>
              </div>
              <div
                className="text-xs mt-2"
                style={{ color: routing.color, opacity: 0.85 }}
              >
                {overallScore >= T_AUTO
                  ? "cleared all thresholds"
                  : overallScore >= T_STAGED
                    ? `${T_AUTO - overallScore} below AUTO`
                    : overallScore >= T_SUGGEST
                      ? `${T_STAGED - overallScore} below STAGED_AUTO`
                      : `${T_SUGGEST - overallScore} below SUGGEST`}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div
                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: routing.color, opacity: 0.8 }}
              >
                Routing
              </div>
              <div className="flex items-center justify-end gap-2 mt-0.5">
                <span className="text-2xl" style={{ color: routing.color }}>
                  {routing.icon}
                </span>
                <span
                  className="text-lg font-bold tabular-nums"
                  style={{
                    color: routing.color,
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  {routing.name}
                </span>
              </div>
              <div
                className="text-xs mt-1 font-semibold"
                style={{ color: routing.color }}
              >
                {routing.label}
              </div>
            </div>
          </div>
          {/* Threshold bar */}
          <div className="mt-4 relative">
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: "#e5e7eb" }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.max(2, Math.min(100, overallScore))}%`,
                  backgroundColor: routing.color,
                }}
              />
            </div>
            {[T_SUGGEST, T_STAGED, T_AUTO].map((t) => (
              <div
                key={t}
                className="absolute top-0 h-2 w-0.5"
                style={{ left: `calc(${t}% - 1px)`, backgroundColor: "#94a3b8" }}
                title={`${t === T_SUGGEST ? "SUGGEST" : t === T_STAGED ? "STAGED_AUTO" : "AUTO"} threshold`}
              />
            ))}
            <div
              className="mt-1 relative text-[10px]"
              style={{
                color: "var(--muted-foreground, #6b7280)",
                height: "1rem",
              }}
            >
              <span className="absolute" style={{ left: "0%" }}>
                0
              </span>
              <span
                className="absolute"
                style={{
                  left: `${T_SUGGEST}%`,
                  transform: "translateX(-50%)",
                }}
              >
                {T_SUGGEST} <span className="opacity-60">SUGGEST</span>
              </span>
              <span
                className="absolute"
                style={{ left: `${T_STAGED}%`, transform: "translateX(-50%)" }}
              >
                {T_STAGED} <span className="opacity-60">STAGED</span>
              </span>
              <span
                className="absolute"
                style={{ left: `${T_AUTO}%`, transform: "translateX(-50%)" }}
              >
                {T_AUTO} <span className="opacity-60">AUTO</span>
              </span>
              <span className="absolute" style={{ right: "0%" }}>
                100
              </span>
            </div>
          </div>
          <div className="mt-6 text-sm" style={{ color: routing.color }}>
            {routing.blurb}
          </div>
        </div>
      </div>

      {/* Bucket summary tiles */}
      <div className="px-4 pb-2">
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              "safe_to_remove",
              "verify_first",
              "investigate_first",
              "protected",
            ] as const
          ).map((a) => {
            const style = ACTION_STYLE[a]
            const count = buckets[a].length
            const disabled = count === 0 || a === "protected"
            return (
              <button
                key={a}
                disabled={disabled}
                onClick={() => !disabled && selectBucket(buckets[a])}
                className="text-left rounded-lg p-2.5 border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: style.bg, borderColor: style.border }}
              >
                <div
                  className="text-[10px] font-semibold uppercase tracking-[0.1em]"
                  style={{ color: style.color, opacity: 0.85 }}
                >
                  {style.label}
                </div>
                <div
                  className="text-2xl font-bold tabular-nums mt-0.5"
                  style={{ color: style.color }}
                >
                  {count}
                </div>
                {!disabled && (
                  <div
                    className="text-[10px] mt-0.5"
                    style={{ color: style.color, opacity: 0.8 }}
                  >
                    Select all
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Rule list grouped by bucket */}
      <div className="px-4 pb-2 space-y-3">
        {(
          [
            "safe_to_remove",
            "verify_first",
            "investigate_first",
            "protected",
          ] as const
        ).map((a) => {
          const rules = buckets[a]
          if (!rules.length) return null
          const style = ACTION_STYLE[a]
          return (
            <div
              key={a}
              className="rounded-lg border overflow-hidden"
              style={{ borderColor: style.border }}
            >
              <div
                className="px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] flex items-center justify-between"
                style={{ backgroundColor: style.bg, color: style.color }}
              >
                <span>
                  {style.label} ({rules.length})
                </span>
              </div>
              <div className="divide-y" style={{ borderColor: style.border }}>
                {rules.map((rule) => {
                  const isSelected = selected.has(rule.rule_id)
                  const isProtected = a === "protected"
                  const conf = rule.recommendation?.confidence ?? 0
                  const conn = rule.traffic?.connection_count ?? 0
                  return (
                    <div
                      key={rule.rule_id}
                      className={`px-3 py-2 flex items-start gap-3 ${
                        isProtected ? "opacity-70" : "cursor-pointer hover:bg-gray-50"
                      }`}
                      onClick={() => !isProtected && toggleRule(rule.rule_id)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected && !isProtected}
                        disabled={isProtected}
                        onChange={() =>
                          !isProtected && toggleRule(rule.rule_id)
                        }
                        className="mt-1 w-4 h-4 rounded border-[var(--border,#d1d5db)] disabled:opacity-40"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-semibold text-[var(--foreground,#111827)]">
                            {rule.direction.toUpperCase()} · {rule.protocol}{" "}
                            {rule.port_range}
                          </span>
                          {rule.is_public && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#dc262620] text-[#dc2626]">
                              PUBLIC
                            </span>
                          )}
                          {isSensitiveExposure(rule) && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#dc262620] text-[#dc2626]">
                              SENSITIVE PORT
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-[var(--muted-foreground,#6b7280)] mt-0.5 truncate">
                          {rule.direction === "inbound" ||
                          rule.direction === "ingress"
                            ? "from"
                            : "to"}{" "}
                          {rule.source}
                          {rule.description ? ` · ${rule.description}` : ""}
                        </div>
                        {/* Evidence line (demo-safe — no AWS service names) */}
                        <div className="text-[11px] mt-1 text-[var(--muted-foreground,#6b7280)]">
                          {conn === 0
                            ? "No connections observed"
                            : `${conn.toLocaleString()} connection${conn === 1 ? "" : "s"} observed`}
                          {rule.traffic?.last_seen
                            ? ` · last ${new Date(rule.traffic.last_seen).toLocaleDateString()}`
                            : ""}
                          {" · "}
                          <span className="font-medium" style={{ color: style.color }}>
                            {rule.recommendation?.reason || "—"}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                          style={{
                            backgroundColor:
                              conf >= 70
                                ? "#22c55e20"
                                : conf >= 40
                                  ? "#f9731620"
                                  : "#ef444420",
                            color:
                              conf >= 70
                                ? "#16a34a"
                                : conf >= 40
                                  ? "#d97706"
                                  : "#dc2626",
                          }}
                          title={`Per-rule confidence: ${conf}/100`}
                        >
                          {conf}%
                        </div>
                        {!isProtected && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onSimulate?.(
                                data.sg_id,
                                rule.rule_id,
                                rule.recommendation?.action || "review",
                              )
                            }}
                            className="text-[11px] text-[#8b5cf6] hover:underline mt-1 font-medium"
                          >
                            Simulate
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {totalRemediable === 0 && (
          <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-[var(--card,#ffffff)] p-4 text-sm text-[var(--muted-foreground,#6b7280)] text-center">
            No remediable rules. All rules are either actively used or
            protected.
          </div>
        )}
      </div>

      {/* Action bar */}
      <div
        className="px-4 py-3 border-t flex items-center justify-between gap-3"
        style={{ borderColor: "var(--border, #e5e7eb)" }}
      >
        <div className="text-xs text-[var(--muted-foreground,#6b7280)]">
          {selected.size > 0
            ? `${selected.size} rule${selected.size === 1 ? "" : "s"} selected`
            : "Select rules to apply"}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={clearSelection}
              className="text-xs text-[var(--muted-foreground,#6b7280)] hover:underline"
            >
              Clear
            </button>
          )}
          <button
            disabled={selected.size === 0}
            onClick={() => onApply?.(data.sg_id, Array.from(selected))}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[#8b5cf6] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#7c3aed] transition-colors"
          >
            Apply selected
          </button>
        </div>
      </div>
    </div>
  )
}

export default SGRemediationCard
