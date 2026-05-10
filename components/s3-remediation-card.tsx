"use client"

/**
 * S3RemediationCard — Bucket policy remediation card matching the
 * v4.4 §11E design language from iam-permission-analysis-modal and
 * sg-remediation-card.
 *
 *   - Numeric confidence (0-100) drives 4-state routing
 *     (AUTO ≥ 0.88 / STAGED_AUTO 0.70 / SUGGEST 0.40 / INSUFFICIENT_DATA <0.40).
 *     S3 control-narrowing thresholds per v4.4 §11E differ from IAM
 *     and SG.
 *   - Per-statement action partition (safe_to_remove / verify_first /
 *     investigate_first / protected) with action ceilings — high-
 *     evidence dangerous statements can't lift routing into AUTO.
 *   - Demo-safe labels — "Access observations" not "CloudTrail data
 *     events".
 *   - Override modal with rationale + rollback acknowledgment, same
 *     Decision Contract §7 audit trail as IAM/SG.
 *
 * Locked principle (same as SG):
 *   For S3, confidence measures EVIDENCE QUALITY.
 *   Action class constrains EXECUTION ELIGIBILITY.
 *   A statement can be high-confidence risky and still low-safety to mutate.
 *
 * Per-statement confidence isn't yet computed by the backend — the
 * gap-analysis response returns risk_level + policy_type + access_count
 * + is_public per statement, no numeric confidence. We derive it
 * client-side here. When the backend adds per-statement scoring
 * (v5 dimension), this client-side derivation drops out.
 *
 * Data source: app/api/proxy/s3-buckets/[bucketName]/gap-analysis
 * Apply call: app/api/proxy/s3-buckets/remediate
 */

import React, { useEffect, useMemo, useState } from "react"
import {
  composeOverriddenBy,
  resolveOperatorIdentity,
  writeOperatorIdentity,
} from "@/lib/operator-identity"

// ── Types ─────────────────────────────────────────────────────────

interface PolicyStatement {
  policy_name: string
  policy_type: "used" | "unused" | "overly_permissive" | string
  risk_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | string
  recommendation: string
  access_count: number
  last_accessed?: string | null
  is_public: boolean
  principal?: string
  actions: string[]
  actions_used?: string[]
  effect: "Allow" | "Deny" | string
  // v4.4 §11E server-emitted fields (backend commit pending).
  // Frontend prefers these when present; falls back to client-side
  // derivation for backwards-compat during rollout. Audit log
  // captures the SERVER numbers.
  evidence_confidence?: number
  calibration_factor?: number
  calibration_reasons?: string[]
  execution_confidence?: number
  action_class?: "safe_to_remove" | "verify_first" | "investigate_first" | "protected"
  action_ceiling?: number
}

interface S3GapResponse {
  bucket_name: string
  bucket_arn?: string
  observation_days?: number
  summary?: {
    total_policies?: number
    used_count?: number
    unused_count?: number
    lp_score?: number
    overall_risk?: string
    s3_events?: number
    has_public_access?: boolean
  }
  policies_analysis: PolicyStatement[]
  used_policies?: string[]
  unused_policies?: string[]
  security_issues?: string[]
  confidence?: string
  timestamp?: string
  error?: boolean
  message?: string
}

interface S3RemediationCardProps {
  bucketName: string
  onApplied?: (
    bucketName: string,
    summary: { removed: number; snapshot_id: string | null },
  ) => void
}

// ── Action partition + ceilings (mirrors SG card) ─────────────────

type StatementAction =
  | "safe_to_remove"
  | "verify_first"
  | "investigate_first"
  | "protected"

function actionCeiling(a: StatementAction): number {
  switch (a) {
    case "safe_to_remove":
      return 100
    case "verify_first":
      return 74
    case "investigate_first":
      return 39
    case "protected":
      return 100
  }
}

// Dangerous actions that should never auto-remove without operator
// review even if the statement looks unused (capability could still be
// load-bearing for emergency / IR access paths).
const DANGEROUS_ACTIONS = new Set([
  "s3:*",
  "*",
  "s3:DeleteBucket",
  "s3:DeleteBucketPolicy",
  "s3:PutBucketPolicy",
  "s3:PutBucketAcl",
  "s3:PutBucketPublicAccessBlock",
  "s3:DeleteObject",
  "s3:DeleteObjectVersion",
])

function hasDangerousActions(stmt: PolicyStatement): boolean {
  for (const a of stmt.actions || []) {
    if (DANGEROUS_ACTIONS.has(a)) return true
    if (a.endsWith(":*")) return true // s3:* etc.
  }
  return false
}

// Base evidence score derived from risk_level. The backend doesn't
// emit per-statement numeric confidence yet; this maps risk_level to
// a baseline that the action-ceiling logic can constrain.
function evidenceFromRiskLevel(rl: string): number {
  switch ((rl || "").toUpperCase()) {
    case "CRITICAL":
      return 50
    case "HIGH":
      return 65
    case "MEDIUM":
      return 80
    case "LOW":
      return 92
    default:
      return 70
  }
}

function classifyStatement(stmt: PolicyStatement): StatementAction {
  const used = stmt.policy_type === "used"
  const unused = stmt.policy_type === "unused"
  const isPublic = !!stmt.is_public
  const dangerous = hasDangerousActions(stmt)
  const hasAccess = (stmt.access_count || 0) > 0

  // Actively used → protected. Removing a used statement breaks real
  // workflows. Even if it's public, removal is not the right move —
  // narrowing the principal/actions is, and that's not in scope for
  // this card.
  if (used || hasAccess) return "protected"

  // Wildcards or destructive actions → investigate_first regardless
  // of evidence. Same principle as SG sensitive-port: high-confidence
  // risky / low-safety to mutate.
  if (dangerous) return "investigate_first"

  // Unused + public → investigate_first. We CAN auto-remove these
  // safely from the data perspective (no traffic observed), but the
  // operator should affirmatively decide that nobody outside the
  // account depends on the implicit public exposure.
  if (unused && isPublic) return "investigate_first"

  // Unused + non-public + non-dangerous → score-based partition.
  if (unused) {
    const ev = evidenceFromRiskLevel(stmt.risk_level)
    if (ev >= 85) return "safe_to_remove"
    if (ev >= 60) return "verify_first"
    return "investigate_first"
  }

  // Overly permissive (Action wildcards on Allow statements not yet
  // flagged "unused" by the backend) → investigate_first.
  if (stmt.policy_type === "overly_permissive") return "investigate_first"

  return "verify_first"
}

// ── Visual tokens (mirror SG card) ────────────────────────────────

const ACTION_STYLE: Record<
  StatementAction,
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
    label: "Protected (active)",
    color: "#4b5563",
    bg: "#f3f4f6",
    border: "#e5e7eb",
  },
}

// ── v4.4 §11E S3 thresholds (different per operation) ─────────────

type Operation = "narrowing" | "deletion"

const THRESHOLDS: Record<
  Operation,
  { AUTO: number; STAGED: number; SUGGEST: number }
> = {
  // S3 control narrowing — narrowing a Principal/Action scope
  narrowing: { AUTO: 88, STAGED: 70, SUGGEST: 40 },
  // S3 deletion — removing an entire statement
  deletion: { AUTO: 92, STAGED: 75, SUGGEST: 40 },
}

interface RoutingState {
  name: string
  label: string
  blurb: string
  color: string
  bg: string
  border: string
  icon: string
}

function routingFromScore(score: number, op: Operation): RoutingState {
  const T = THRESHOLDS[op]
  if (score >= T.AUTO)
    return {
      name: "AUTO",
      label: `Ready for auto-execute (${op})`,
      blurb:
        "Eligible for the full pipeline: snapshot → canary → staged → full rollout, no manual approval needed.",
      color: "#15803d",
      bg: "#f0fdf4",
      border: "#bbf7d0",
      icon: "✓",
    }
  if (score >= T.STAGED)
    return {
      name: "STAGED_AUTO",
      label: `Canary + staged auto (${op})`,
      blurb:
        "Eligible for canary and staged rollout. Full rollout requires human approval.",
      color: "#1e40af",
      bg: "#eff6ff",
      border: "#bfdbfe",
      icon: "◐",
    }
  if (score >= T.SUGGEST)
    return {
      name: "SUGGEST",
      label: `Suggested — needs approval (${op})`,
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
      "Bucket visible but Cyntro lacks evidence to act. Improve coverage or override.",
    color: "#991b1b",
    bg: "#fef2f2",
    border: "#fecaca",
    icon: "⊘",
  }
}

// ── Override modal state machine (mirror SG card) ─────────────────

type OverridePhase = "closed" | "form" | "applying" | "success" | "error"
interface OverrideState {
  phase: OverridePhase
  rationale: string
  ackRollback: boolean
  blockReasons: string[]
  resultMessage: string
  selectedStatements: string[]
  // Operator self-attestation (pre-SSO). Same pattern as the SG card.
  operatorName: string
  operatorEmail: string
}
const INITIAL_OVERRIDE: OverrideState = {
  phase: "closed",
  rationale: "",
  ackRollback: true,
  blockReasons: [],
  resultMessage: "",
  selectedStatements: [],
  operatorName: "",
  operatorEmail: "",
}

// ── Component ──────────────────────────────────────────────────────

export function S3RemediationCard({
  bucketName,
  onApplied,
}: S3RemediationCardProps) {
  const [data, setData] = useState<S3GapResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [overrideState, setOverrideState] =
    useState<OverrideState>(INITIAL_OVERRIDE)

  const refetch = () => {
    fetch(`/api/proxy/s3-buckets/${bucketName}/gap-analysis`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d: S3GapResponse) => {
        if (d?.error) setErr(d.message || "Backend error")
        setData(d)
      })
      .catch((e) => setErr(e?.message || "Network error"))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    fetch(`/api/proxy/s3-buckets/${bucketName}/gap-analysis`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d: S3GapResponse) => {
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
  }, [bucketName])

  // ── Per-statement views + bucketing ────────────────────────────
  type StatementView = PolicyStatement & {
    _action: StatementAction
    _evidence_confidence: number
    _execution_confidence: number
    _ceiling: number
  }

  const stmtViews = useMemo<StatementView[]>(() => {
    if (!data?.policies_analysis) return []
    return data.policies_analysis.map((s) => {
      // Prefer backend-emitted v4.4 §11E fields when present; fall
      // back to client-side classification for backwards-compat.
      const action: StatementAction =
        s.action_class ?? classifyStatement(s)
      const evidence = s.evidence_confidence ?? evidenceFromRiskLevel(s.risk_level)
      const ceiling = s.action_ceiling ?? actionCeiling(action)
      const execution =
        s.execution_confidence ?? Math.min(evidence, ceiling)
      return {
        ...s,
        _action: action,
        _evidence_confidence: evidence,
        _execution_confidence: execution,
        _ceiling: ceiling,
      }
    })
  }, [data])

  const buckets = useMemo(() => {
    const out: Record<StatementAction, StatementView[]> = {
      safe_to_remove: [],
      verify_first: [],
      investigate_first: [],
      protected: [],
    }
    for (const s of stmtViews) out[s._action].push(s)
    return out
  }, [stmtViews])

  const overallScore = useMemo(() => {
    const remediable = stmtViews.filter((s) => s._action !== "protected")
    if (!remediable.length) return 0
    const sum = remediable.reduce(
      (acc, s) => acc + s._execution_confidence,
      0,
    )
    return Math.round(sum / remediable.length)
  }, [stmtViews])

  const hasRemediable = useMemo(
    () => stmtViews.some((s) => s._action !== "protected"),
    [stmtViews],
  )

  // S3 remediation is statement DELETION (removing whole statement from
  // bucket policy). Stricter deletion thresholds apply.
  const operation: Operation = "deletion"
  const routing = useMemo(
    () =>
      hasRemediable
        ? routingFromScore(overallScore, operation)
        : routingFromScore(0, operation),
    [overallScore, hasRemediable, operation],
  )
  const T = THRESHOLDS[operation]

  // ── Apply lifecycle (mirror SG card) ───────────────────────────

  const extractBlockReasons = (resp: any): string[] => {
    const reasons: string[] = []
    if (resp?.block_reason) reasons.push(String(resp.block_reason))
    if (resp?.message && !reasons.includes(String(resp.message)))
      reasons.push(String(resp.message))
    if (Array.isArray(resp?.safety_warnings))
      for (const w of resp.safety_warnings) reasons.push(String(w))
    if (Array.isArray(resp?.potential_impact))
      for (const i of resp.potential_impact)
        reasons.push(
          typeof i === "string"
            ? i
            : i?.reason || i?.message || JSON.stringify(i),
        )
    const sb = resp?.score_breakdown
    if (sb && typeof sb.score === "number") {
      reasons.push(
        `Confidence score ${(sb.score * 100).toFixed(0)}/100 (${sb.confidence_level || "LOW"})`,
      )
      if (sb.formula) reasons.push(`Formula: ${sb.formula}`)
    }
    return reasons.filter(Boolean)
  }

  const isBlockedResponse = (resp: any): boolean => {
    if (!resp) return false
    if (resp.success === false) return true
    if (resp.blocked === true) return true
    if (resp.decision === "blocked" || resp.decision_canonical === "BLOCK")
      return true
    if (resp.error && /override_lineage_required/i.test(JSON.stringify(resp)))
      return true
    return false
  }

  const callRemediate = async (
    statementNames: string[],
    force: boolean,
    overrideLineage?: Record<string, any>,
  ) => {
    const body: Record<string, any> = {
      bucket_name: bucketName,
      policies_to_remove: statementNames,
      create_snapshot: true,
      force,
    }
    if (overrideLineage) body.override_lineage = overrideLineage
    const res = await fetch(`/api/proxy/s3-buckets/remediate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    let json: any = {}
    try {
      json = await res.json()
    } catch {
      json = { error: `HTTP ${res.status}` }
    }
    return { ok: res.ok, status: res.status, body: json }
  }

  const handleApply = async () => {
    if (selected.size === 0) return
    const selectedStatements = Array.from(selected)

    const first = await callRemediate(selectedStatements, false)
    if (
      first.ok &&
      first.body?.success === true &&
      !isBlockedResponse(first.body)
    ) {
      onApplied?.(bucketName, {
        removed: first.body.policies_removed || 0,
        snapshot_id: first.body.snapshot_id || null,
      })
      setSelected(new Set())
      setTimeout(refetch, 1500)
      return
    }

    const reasons = extractBlockReasons(first.body)
    if (reasons.length === 0) {
      reasons.push(
        `Backend declined to auto-apply without explicit override. HTTP ${first.status}.`,
      )
    }
    const id = resolveOperatorIdentity()
    setOverrideState({
      phase: "form",
      rationale: "",
      ackRollback: true,
      blockReasons: reasons,
      resultMessage: "",
      selectedStatements,
      operatorName: id.name,
      operatorEmail: id.email || "",
    })
  }

  const submitOverride = async () => {
    const trimmed = overrideState.rationale.trim()
    if (!trimmed) return
    const nameTrim = overrideState.operatorName.trim()
    if (!nameTrim) return
    setOverrideState((s) => ({ ...s, phase: "applying" }))

    // Persist for next override.
    writeOperatorIdentity(
      nameTrim,
      overrideState.operatorEmail.trim() || undefined,
    )

    const lineage = {
      rationale: trimmed,
      acknowledged: ["score_based_block", "operator_override"],
      rollback_plan_acknowledged: overrideState.ackRollback,
      overridden_by: composeOverriddenBy(
        nameTrim,
        overrideState.operatorEmail.trim() || undefined,
      ),
      overridden_at: new Date().toISOString(),
      identity_source: "self_attested",
    }
    try {
      const r = await callRemediate(
        overrideState.selectedStatements,
        true,
        lineage,
      )
      if (r.ok && r.body?.success !== false) {
        const removed = r.body.policies_removed || 0
        const snap = r.body.snapshot_id || null
        setOverrideState((s) => ({
          ...s,
          phase: "success",
          resultMessage: `Removed ${removed} statement${removed === 1 ? "" : "s"} from ${bucketName}.\nSnapshot: ${snap || "(not captured)"}`,
        }))
        onApplied?.(bucketName, { removed, snapshot_id: snap })
        setTimeout(() => {
          refetch()
          setSelected(new Set())
        }, 1500)
      } else {
        const msg =
          (r.body?.error && typeof r.body.error === "object"
            ? JSON.stringify(r.body.error)
            : r.body?.error) ||
          r.body?.detail ||
          r.body?.message ||
          `HTTP ${r.status}`
        setOverrideState((s) => ({
          ...s,
          phase: "error",
          resultMessage: String(msg).slice(0, 600),
        }))
      }
    } catch (e: any) {
      setOverrideState((s) => ({
        ...s,
        phase: "error",
        resultMessage: e?.message || "Network error",
      }))
    }
  }

  const closeOverride = () => setOverrideState(INITIAL_OVERRIDE)

  const toggleStatement = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const selectBucket = (rows: StatementView[]) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const r of rows) next.add(r.policy_name)
      return next
    })
  }

  const clearSelection = () => setSelected(new Set())

  // ── Render ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 rounded-xl border border-[var(--border,#e5e7eb)] bg-[var(--card,#ffffff)] text-sm text-[var(--muted-foreground,#6b7280)]">
        Loading policy analysis for {bucketName}…
      </div>
    )
  }
  if (err || !data) {
    return (
      <div className="p-6 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
        Failed to load {bucketName}: {err || "no data"}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--border,#e5e7eb)] bg-[var(--card,#ffffff)] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border,#e5e7eb)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground,#6b7280)]">
              S3 Bucket
            </div>
            <div className="text-xl font-bold mt-0.5 text-[var(--foreground,#111827)] truncate">
              {data.bucket_name}
            </div>
            <div className="text-xs text-[var(--muted-foreground,#6b7280)] mt-0.5 flex gap-3">
              {data.summary?.has_public_access && (
                <span className="text-[#dc2626] font-semibold">
                  ⚠ PUBLIC ACCESS
                </span>
              )}
              <span>
                {data.observation_days ? `${data.observation_days}d observation` : ""}
              </span>
              <span>
                {data.summary?.s3_events !== undefined
                  ? `${data.summary.s3_events} access events`
                  : ""}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground,#6b7280)]">
              Policy Statements
            </div>
            <div className="text-2xl font-bold tabular-nums text-[var(--foreground,#111827)]">
              {data.policies_analysis.length}
            </div>
          </div>
        </div>
      </div>

      {/* Confidence card */}
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
                {overallScore >= T.AUTO
                  ? "cleared all thresholds"
                  : overallScore >= T.STAGED
                    ? `${T.AUTO - overallScore} below AUTO`
                    : overallScore >= T.SUGGEST
                      ? `${T.STAGED - overallScore} below STAGED_AUTO`
                      : `${T.SUGGEST - overallScore} below SUGGEST`}
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
            {[T.SUGGEST, T.STAGED, T.AUTO].map((t) => (
              <div
                key={t}
                className="absolute top-0 h-2 w-0.5"
                style={{
                  left: `calc(${t}% - 1px)`,
                  backgroundColor: "#94a3b8",
                }}
                title={`${t === T.SUGGEST ? "SUGGEST" : t === T.STAGED ? "STAGED_AUTO" : "AUTO"} threshold`}
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
                  left: `${T.SUGGEST}%`,
                  transform: "translateX(-50%)",
                }}
              >
                {T.SUGGEST} <span className="opacity-60">SUGGEST</span>
              </span>
              <span
                className="absolute"
                style={{
                  left: `${T.STAGED}%`,
                  transform: "translateX(-50%)",
                }}
              >
                {T.STAGED} <span className="opacity-60">STAGED</span>
              </span>
              <span
                className="absolute"
                style={{ left: `${T.AUTO}%`, transform: "translateX(-50%)" }}
              >
                {T.AUTO} <span className="opacity-60">AUTO</span>
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

      {/* Statement list grouped by bucket */}
      <div className="px-4 pb-2 space-y-3">
        {(
          [
            "safe_to_remove",
            "verify_first",
            "investigate_first",
            "protected",
          ] as const
        ).map((a) => {
          const rows = buckets[a]
          if (!rows.length) return null
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
                  {style.label} ({rows.length})
                </span>
              </div>
              <div className="divide-y" style={{ borderColor: style.border }}>
                {rows.map((s) => {
                  const isSelected = selected.has(s.policy_name)
                  const isProtected = a === "protected"
                  const evidence = s._evidence_confidence
                  const execution = s._execution_confidence
                  const capped = execution < evidence
                  return (
                    <div
                      key={s.policy_name}
                      className={`px-3 py-2 flex items-start gap-3 ${
                        isProtected ? "opacity-70" : "cursor-pointer hover:bg-gray-50"
                      }`}
                      onClick={() => !isProtected && toggleStatement(s.policy_name)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected && !isProtected}
                        disabled={isProtected}
                        onChange={() =>
                          !isProtected && toggleStatement(s.policy_name)
                        }
                        className="mt-1 w-4 h-4 rounded border-[var(--border,#d1d5db)] disabled:opacity-40"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-semibold text-[var(--foreground,#111827)]">
                            {s.policy_name}
                          </span>
                          {s.is_public && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#dc262620] text-[#dc2626]">
                              PUBLIC
                            </span>
                          )}
                          {hasDangerousActions(s) && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#dc262620] text-[#dc2626]">
                              DESTRUCTIVE ACTIONS
                            </span>
                          )}
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: style.bg,
                              color: style.color,
                            }}
                          >
                            {s.risk_level}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-[var(--muted-foreground,#6b7280)] mt-0.5 truncate">
                          {s.effect} {(s.actions || []).slice(0, 3).join(", ")}
                          {(s.actions || []).length > 3
                            ? ` +${s.actions.length - 3}`
                            : ""}
                          {s.principal ? ` · principal: ${s.principal}` : ""}
                        </div>
                        <div className="text-[11px] mt-1 text-[var(--muted-foreground,#6b7280)]">
                          {(s.access_count || 0) === 0
                            ? "No access events observed"
                            : `${s.access_count} access event${s.access_count === 1 ? "" : "s"} observed`}
                          {s.last_accessed
                            ? ` · last ${new Date(s.last_accessed).toLocaleDateString()}`
                            : ""}
                          {" · "}
                          <span className="font-medium" style={{ color: style.color }}>
                            {s.recommendation || "—"}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1 justify-end">
                          {capped && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-mono text-gray-500 bg-gray-100 line-through"
                              title={`Evidence: ${evidence}% (raw, pre-action-ceiling)`}
                            >
                              {evidence}%
                            </span>
                          )}
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                            style={{
                              backgroundColor:
                                execution >= 70
                                  ? "#22c55e20"
                                  : execution >= 40
                                    ? "#f9731620"
                                    : "#ef444420",
                              color:
                                execution >= 70
                                  ? "#16a34a"
                                  : execution >= 40
                                    ? "#d97706"
                                    : "#dc2626",
                            }}
                            title={
                              capped
                                ? `Evidence ${evidence}% capped to ${execution}% by action class "${s._action}" (ceiling ${s._ceiling}). Routing follows execution_confidence.`
                                : `Per-statement execution confidence: ${execution}/100`
                            }
                          >
                            {execution}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {stmtViews.length === 0 && (
          <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-[var(--card,#ffffff)] p-4 text-sm text-[var(--muted-foreground,#6b7280)] text-center">
            No policy statements on this bucket.
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
            ? `${selected.size} statement${selected.size === 1 ? "" : "s"} selected`
            : "Select statements to apply"}
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
            disabled={
              selected.size === 0 ||
              overrideState.phase === "applying"
            }
            onClick={handleApply}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[#8b5cf6] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#7c3aed] transition-colors"
            title="Apply the selected statement removals (override modal opens if backend blocks)"
          >
            {overrideState.phase === "applying" ? "Applying…" : "Apply selected"}
          </button>
        </div>
      </div>

      {/* Override modal */}
      {overrideState.phase !== "closed" && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl">
            {overrideState.phase === "form" && (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">⚠</span>
                  <h3 className="text-lg font-bold text-[#b45309]">
                    Override required
                  </h3>
                </div>
                <p className="text-sm text-[var(--foreground,#111827)] mb-3">
                  Cyntro paused this remediation. You can override and proceed
                  — the change runs immediately with a rollback snapshot. The
                  override is recorded in the audit log.
                </p>
                <div className="mb-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <div className="font-semibold mb-1">Reasons:</div>
                  <ul className="list-disc ml-4 space-y-0.5">
                    {overrideState.blockReasons.slice(0, 6).map((r, i) => (
                      <li key={i} className="break-words">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
                {/* Operator identity — pre-SSO self-attestation. Same
                    pattern as the SG card; backend writes identity_source:
                    "self_attested" on the OverrideEvent so compliance
                    can distinguish from auth-verified entries. */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#92400e] mb-1">
                      Your name <span className="text-rose-600">*</span>
                    </label>
                    <input
                      value={overrideState.operatorName}
                      onChange={(e) =>
                        setOverrideState((s) => ({
                          ...s,
                          operatorName: e.target.value,
                        }))
                      }
                      placeholder="e.g. Alice Operator"
                      className="w-full border border-[var(--border,#d1d5db)] rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f59e0b]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#92400e] mb-1">
                      Email <span className="text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="email"
                      value={overrideState.operatorEmail}
                      onChange={(e) =>
                        setOverrideState((s) => ({
                          ...s,
                          operatorEmail: e.target.value,
                        }))
                      }
                      placeholder="alice@company.com"
                      className="w-full border border-[var(--border,#d1d5db)] rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f59e0b]"
                    />
                  </div>
                </div>
                <label className="block text-xs font-semibold text-[#92400e] mb-1">
                  Why are you overriding? (Slack thread, ticket #, customer
                  confirmation — recorded in the audit trail)
                </label>
                <textarea
                  value={overrideState.rationale}
                  onChange={(e) =>
                    setOverrideState((s) => ({
                      ...s,
                      rationale: e.target.value,
                    }))
                  }
                  placeholder="e.g. Confirmed with @data-team in #incidents that the AllowUnusedBucketTagRead statement is a leftover from a deprecated tagging job; ticket DATA-1842"
                  rows={3}
                  className="w-full border border-[var(--border,#d1d5db)] rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f59e0b] mb-3"
                />
                <label className="flex items-start gap-2 mb-4 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideState.ackRollback}
                    onChange={(e) =>
                      setOverrideState((s) => ({
                        ...s,
                        ackRollback: e.target.checked,
                      }))
                    }
                    className="mt-0.5 w-4 h-4 text-[#f59e0b] rounded border-[var(--border,#d1d5db)] focus:ring-[#f59e0b]"
                  />
                  <span className="text-[var(--foreground,#374151)]">
                    I understand a rollback snapshot will be created and I am
                    responsible for verifying the change does not break
                    dependent systems.
                  </span>
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={closeOverride}
                    className="px-4 py-2 border-2 border-[var(--border,#e5e7eb)] rounded-lg font-semibold text-[var(--foreground,#111827)] hover:bg-[var(--muted,#f3f4f6)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitOverride}
                    disabled={
                      !overrideState.rationale.trim() ||
                      !overrideState.ackRollback ||
                      !overrideState.operatorName.trim()
                    }
                    className="px-5 py-2 bg-[#f59e0b] text-white rounded-lg font-bold hover:bg-[#d97706] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      !overrideState.operatorName.trim()
                        ? "Your name is required for the audit log"
                        : !overrideState.rationale.trim()
                          ? "Rationale required for the audit log"
                          : !overrideState.ackRollback
                            ? "Acknowledge the rollback responsibility to proceed"
                            : "Apply the change with override"
                    }
                  >
                    Apply Anyway
                  </button>
                </div>
              </>
            )}
            {overrideState.phase === "applying" && (
              <div className="text-center py-6">
                <div className="text-3xl mb-3">⏳</div>
                <h3 className="text-lg font-bold text-[#b45309]">
                  Applying remediation…
                </h3>
                <p className="mt-2 text-sm text-[var(--muted-foreground,#6b7280)]">
                  Snapshot, AWS mutate, and verify. Usually completes in a few
                  seconds.
                </p>
              </div>
            )}
            {overrideState.phase === "success" && (
              <div className="text-center py-2">
                <div className="text-3xl mb-3 text-emerald-500">✓</div>
                <h3 className="text-lg font-bold text-[#15803d]">
                  Remediation applied
                </h3>
                <p className="mt-2 text-sm text-[var(--foreground,#374151)] whitespace-pre-line break-words">
                  {overrideState.resultMessage}
                </p>
                <button
                  onClick={closeOverride}
                  className="mt-4 px-5 py-2 bg-[#22c55e] text-white rounded-lg font-bold hover:bg-[#16a34a]"
                >
                  Done
                </button>
              </div>
            )}
            {overrideState.phase === "error" && (
              <div className="text-center py-2">
                <div className="text-3xl mb-3 text-rose-500">✕</div>
                <h3 className="text-lg font-bold text-[#991b1b]">
                  Remediation failed
                </h3>
                <p className="mt-2 text-sm text-[var(--foreground,#374151)] whitespace-pre-line break-words">
                  {overrideState.resultMessage}
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    onClick={() =>
                      setOverrideState((s) => ({
                        ...s,
                        phase: "form",
                        resultMessage: "",
                      }))
                    }
                    className="px-4 py-2 border-2 border-[var(--border,#e5e7eb)] rounded-lg font-semibold text-[var(--foreground,#111827)] hover:bg-[var(--muted,#f3f4f6)]"
                  >
                    Try again
                  </button>
                  <button
                    onClick={closeOverride}
                    className="px-4 py-2 bg-[var(--foreground,#374151)] text-white rounded-lg font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default S3RemediationCard
