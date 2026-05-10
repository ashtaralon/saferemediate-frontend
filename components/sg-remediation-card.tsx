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
import {
  OverrideModalShared,
  buildOverrideStateForOpen,
  INITIAL_SHARED_OVERRIDE_STATE,
  type OverrideLineagePayload,
  type SharedOverrideState,
} from "@/components/override-modal-shared"

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
  confidence: number // 0-100 — legacy field, equals evidence_confidence
  suggested_cidrs?: string[]
  observed_sources?: string[]
  // v4.4 §11E server-emitted fields (backend commit ad0eb27).
  // Frontend prefers these when present; falls back to client-side
  // derivation for backwards-compat during rollout. Backend is the
  // canonical source — these are what the audit log captures.
  evidence_confidence?: number
  calibration_factor?: number
  calibration_reasons?: string[]
  execution_confidence?: number
  action_class?: "safe_to_remove" | "verify_first" | "investigate_first" | "protected"
  action_ceiling?: number
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

interface OrphanInfo {
  orphan_status: string | null
  is_orphan: boolean
  attachment_count: number | null
  attached_eni_count: number
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
  orphan_info?: OrphanInfo
  error?: boolean
  message?: string
}

interface SGRemediationCardProps {
  sgId: string
  onSimulate?: (sgId: string, ruleId: string, action: string) => void
  /**
   * Notification fired AFTER a successful apply completes. The card
   * owns the HTTP call (including the override-modal flow on BLOCK),
   * so the parent's only job here is to refresh dependent state.
   */
  onApplied?: (sgId: string, summary: { removed: number; snapshot_id: string | null }) => void
}

// ── Override modal — shared component handles UI + identity capture
//
// Apply lifecycle (parent owns the HTTP calls):
//   1. User clicks Apply → first attempt without force/lineage.
//   2. Backend success=true → notify parent, refresh.
//   3. Backend blocked → open SHARED modal with reasons listed.
//   4. Operator fills form → shared modal builds the lineage and
//      calls our onSubmit(lineage) callback.
//   5. We re-submit with force=true + lineage; on response update
//      the shared modal's phase to "success" or "error".
//
// The shared modal (components/override-modal-shared.tsx) is the
// single source of truth for: form rendering, identity capture,
// localStorage persistence, lineage assembly, RFC-5322 mailbox
// composition. SG-specific bits (selected rule IDs to apply on
// submit) stay in this card.

// Extended state — shared modal state PLUS the SG-specific selection
// captured at click-time so the form survives selection changes.
interface OverrideState extends SharedOverrideState {
  selectedRuleIds: string[]
}

const INITIAL_OVERRIDE: OverrideState = {
  ...INITIAL_SHARED_OVERRIDE_STATE,
  selectedRuleIds: [],
}

// ── Action partition + action ceilings ────────────────────────────
//
// Locked principle (do not refactor away without re-reading this):
//
//   For SGs, confidence measures EVIDENCE QUALITY.
//   Action class constrains EXECUTION ELIGIBILITY.
//   A rule can be high-confidence risky and still low-safety to mutate.
//
// Why: SG rule action is computed from NON-score signals (sensitive
// port + public exposure, SG references, observation-window adequacy)
// that the raw confidence number doesn't see. Without action ceilings
// a 1-rule SG whose only remediable rule is sensitive+public+idle
// (raw conf 85) would route to STAGED_AUTO purely by averaging — the
// exact theatrical-safety failure mode we already closed for IAM at
// the per-permission level.
//
// The fix: every action class declares an execution-confidence ceiling.
// We compute execution_confidence = min(rule.confidence, ceiling).
// Routing then derives naturally from execution averages — no separate
// routing overrides, no contradictions like "investigate_first +
// STAGED_AUTO."
//
// Bypass: protected rules are EXCLUDED from the remediable average, not
// included with a ceiling of 100. They have no execution semantics.
type RuleAction =
  | "safe_to_remove"
  | "verify_first"
  | "investigate_first"
  | "protected"

const SENSITIVE_PORTS = new Set([22, 3389, 3306, 5432, 27017, 6379, 9200, 11211])

// Per-action execution ceilings (0-100). Aligned with routing thresholds:
//   AUTO        ≥ 90 (SG narrowing) / 92 (SG deletion)
//   STAGED_AUTO ≥ 70 / 75
//   SUGGEST     ≥ 40
// safe_to_remove can ride raw score up to AUTO. verify_first caps at
// 74 — clears narrowing-STAGED but not narrowing-AUTO, and falls to
// SUGGEST for deletion. investigate_first caps at 39 — never reaches
// any auto band, always SUGGEST or INSUFFICIENT_DATA.
function actionCeiling(action: RuleAction): number {
  switch (action) {
    case "safe_to_remove":
      return 100
    case "verify_first":
      return 74
    case "investigate_first":
      return 39
    case "protected":
      return 100 // excluded from remediable avg; ceiling is a no-op
  }
}

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

// Observation-window adequacy: 14d is the floor below which "no traffic"
// is too thin a signal to act on. Mirrors the v4.4 §11M5 freshness gate
// philosophy — when window is short and a rule is idle, we don't know
// if the rule is dead or just hasn't fired this week.
const MIN_OBSERVATION_DAYS_FOR_IDLE_VERDICT = 14

function classifyRule(
  rule: RuleAnalysis,
  observationDays: number,
): RuleAction {
  const hasTraffic = (rule.traffic?.connection_count ?? 0) > 0
  const sensitive = isSensitiveExposure(rule)
  const conf = rule.recommendation?.confidence ?? 0
  const isSgRef = rule.source?.startsWith("sg-") ?? false
  const windowAdequate =
    (observationDays || 0) >= MIN_OBSERVATION_DAYS_FOR_IDLE_VERDICT

  // SG reference + active traffic → protected (control-plane / LB wiring
  // confirmed live). Operator should not auto-remove.
  if (isSgRef && hasTraffic) return "protected"

  // SG reference + no traffic + thin window → still protected. We
  // haven't watched long enough to call this rule dead. Avoid burning
  // operator-review cycles on rules that just haven't fired this week.
  if (isSgRef && !hasTraffic && !windowAdequate) return "protected"

  // SG reference + no traffic + adequate window → verify_first. Operator
  // hand-review with the dependency-graph context; could legitimately
  // be a deprecated app's leftover.
  if (isSgRef && !hasTraffic && windowAdequate) return "verify_first"

  // Sensitive + active traffic → protected. DB/SSH actively used; don't
  // touch even if confidence is high.
  if (sensitive && hasTraffic) return "protected"

  // Sensitive + public → investigate_first regardless of traffic.
  // Sensitive public exposure is high-confidence risky (we KNOW this
  // is a misconfig pattern) but low-safety to mutate without operator
  // approval — exactly the case the action ceiling exists to gate.
  if (sensitive) return "investigate_first"

  // Idle rule + thin window → investigate_first. Same reasoning as
  // SG-ref + thin window, but for non-ref rules. The score itself is
  // probably already low; the ceiling enforces it.
  if (!hasTraffic && !windowAdequate) return "investigate_first"

  // Has traffic on a non-sensitive, non-public rule → verify_first.
  if (hasTraffic) return "verify_first"

  // Score-only partition (only reached when window is adequate AND no
  // traffic AND not sensitive AND not an SG ref).
  if (conf >= 85) return "safe_to_remove"
  if (conf >= 60) return "verify_first"
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

// ── v4.4 §11E SG thresholds (different per operation) ─────────────
//
// SG deletion is more destructive than SG narrowing — removing a rule
// entirely vs tightening its CIDR. v4.4 §11E codifies that with
// different threshold bands per operation. The card detects the
// operation from the rule recommendations: if ANY remediable rule's
// recommendation.action is "delete" we use the stricter deletion
// thresholds for the whole resource (conservative-by-default for
// mixed batches).
type Operation = "narrowing" | "deletion"

const THRESHOLDS: Record<
  Operation,
  { AUTO: number; STAGED: number; SUGGEST: number }
> = {
  narrowing: { AUTO: 90, STAGED: 70, SUGGEST: 40 },
  deletion: { AUTO: 92, STAGED: 75, SUGGEST: 40 },
}

function detectOperation(remediableActions: string[]): Operation {
  // Any deletion in the batch → use the stricter deletion thresholds.
  const hasDelete = remediableActions.some((a) => {
    const s = (a || "").toLowerCase()
    return s === "delete" || s === "remove"
  })
  return hasDelete ? "deletion" : "narrowing"
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

function routingFromScore(score: number, operation: Operation): RoutingState {
  const T = THRESHOLDS[operation]
  if (score >= T.AUTO)
    return {
      name: "AUTO",
      label: `Ready for auto-execute (${operation})`,
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
      label: `Canary + staged auto (${operation})`,
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
      label: `Suggested — needs approval (${operation})`,
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
  onApplied,
}: SGRemediationCardProps) {
  const [data, setData] = useState<SGGapResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [overrideState, setOverrideState] = useState<OverrideState>(INITIAL_OVERRIDE)

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
  //
  // The per-rule execution_confidence model:
  //   raw_confidence          (from backend, evidence quality)
  //   → action class           (from classifyRule, includes non-score signals)
  //   → action ceiling         (from actionCeiling, eligibility cap)
  //   → execution_confidence   (= min(raw, ceiling))
  // Resource-level routing then averages execution_confidence over
  // remediable rules. protected rules are EXCLUDED from the average
  // (they have no execution semantics). This is what prevents an
  // investigate_first rule with raw confidence 85 from lifting routing
  // into STAGED_AUTO.
  type RuleView = RuleAnalysis & {
    _action: RuleAction
    _evidence_confidence: number
    _execution_confidence: number
    _ceiling: number
  }

  const observationDays = data?.observation_days ?? 0

  const ruleViews = useMemo<RuleView[]>(() => {
    if (!data?.rules_analysis) return []
    return data.rules_analysis.map((r) => {
      // Prefer backend-emitted v4.4 §11E fields when present.
      // Falls back to client-side classification when the backend
      // hasn't been redeployed yet (the contract is additive).
      const rec = r.recommendation || ({} as RuleRecommendation)
      const backendAction = rec.action_class
      const action: RuleAction = backendAction ?? classifyRule(r, observationDays)
      const evidence = rec.evidence_confidence ?? rec.confidence ?? 0
      const ceiling = rec.action_ceiling ?? actionCeiling(action)
      const execution = rec.execution_confidence ?? Math.min(evidence, ceiling)
      return {
        ...r,
        _action: action,
        _evidence_confidence: evidence,
        _execution_confidence: execution,
        _ceiling: ceiling,
      }
    })
  }, [data, observationDays])

  const buckets = useMemo(() => {
    const out: Record<RuleAction, RuleView[]> = {
      safe_to_remove: [],
      verify_first: [],
      investigate_first: [],
      protected: [],
    }
    for (const r of ruleViews) out[r._action].push(r)
    return out
  }, [ruleViews])

  const overallScore = useMemo(() => {
    const remediable = ruleViews.filter((r) => r._action !== "protected")
    if (!remediable.length) return 0
    const sum = remediable.reduce(
      (acc, r) => acc + r._execution_confidence,
      0,
    )
    return Math.round(sum / remediable.length)
  }, [ruleViews])

  // Empty-remediable special case: every rule is protected → no apply
  // action is meaningful. Route INSUFFICIENT_DATA explicitly rather
  // than letting the score=0 fall-through speak for itself.
  const hasRemediable = useMemo(
    () => ruleViews.some((r) => r._action !== "protected"),
    [ruleViews],
  )

  // Detect operation from remediable rule recommendations. Mixed batch
  // with any "delete" → use stricter deletion thresholds for the whole
  // resource (conservative-by-default).
  const operation = useMemo<Operation>(
    () =>
      detectOperation(
        ruleViews
          .filter((r) => r._action !== "protected")
          .map((r) => r.recommendation?.action || ""),
      ),
    [ruleViews],
  )

  const routing = useMemo(
    () =>
      hasRemediable
        ? routingFromScore(overallScore, operation)
        : routingFromScore(0, operation),
    [overallScore, hasRemediable, operation],
  )

  const T = THRESHOLDS[operation]

  // ── Preflight (BLOCK detection before click-Apply) ─────────────
  //
  // BLOCK and EVIDENCE_CONFLICT are NOT routing bands — they're hard
  // execution gates surfaced via the /simulate endpoint. Without
  // this, an operator can see "STAGED_AUTO 75 · Apply selected" and
  // click Apply only to be surprised by a snapshot-unreachable / view-
  // parity / freshness BLOCK at execute time. Routing tells you what
  // we recommend; preflight tells you whether the recommendation can
  // execute right now.
  //
  // Debounced so rapid selection changes don't spam the backend.
  type PreflightStatus =
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "clear"; warnings: string[] }
    | { kind: "blocked"; reasons: string[]; warnings: string[] }
    | { kind: "error"; message: string }
  const [preflight, setPreflight] = useState<PreflightStatus>({ kind: "idle" })

  useEffect(() => {
    if (selected.size === 0) {
      setPreflight({ kind: "idle" })
      return
    }

    // Build RuleToRemove payload from the selected rule_views. The
    // simulate endpoint expects a structured object per rule (protocol/
    // port/source/direction), not the synthetic rule_id string.
    const selectedRules = ruleViews.filter((r) => selected.has(r.rule_id))
    const rules_to_remove = selectedRules.map((r) => {
      const m = /^(\d+)(?:-(\d+))?$/.exec(r.port_range || "")
      const fromPort = m ? parseInt(m[1], 10) : null
      const toPort = m ? (m[2] ? parseInt(m[2], 10) : fromPort) : null
      const dir =
        r.direction === "inbound" || r.direction === "ingress"
          ? "inbound"
          : "outbound"
      return {
        protocol: (r.protocol || "tcp").toLowerCase(),
        port: fromPort ?? undefined,
        port_range: toPort && fromPort !== toPort ? r.port_range : undefined,
        source: r.source,
        direction: dir,
      }
    })

    const ctrl = new AbortController()
    const tid = setTimeout(() => {
      setPreflight({ kind: "checking" })
      fetch(`/api/proxy/security-groups/${sgId}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules_to_remove, dry_run: true }),
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((d) => {
          if (ctrl.signal.aborted) return
          const warnings: string[] = Array.isArray(d?.safety_warnings)
            ? d.safety_warnings
            : []
          const impact = Array.isArray(d?.potential_impact)
            ? d.potential_impact
            : []
          if (d?.error || d?.detail) {
            setPreflight({
              kind: "error",
              message: String(d.error || d.detail || "Preflight failed"),
            })
            return
          }
          if (d?.is_safe === false || impact.length > 0) {
            const reasons = impact
              .map((i: any) =>
                typeof i === "string"
                  ? i
                  : i?.reason || i?.message || JSON.stringify(i),
              )
              .filter(Boolean)
            setPreflight({ kind: "blocked", reasons, warnings })
          } else {
            setPreflight({ kind: "clear", warnings })
          }
        })
        .catch((e) => {
          if (ctrl.signal.aborted) return
          setPreflight({
            kind: "error",
            message: e?.message || "Network error",
          })
        })
    }, 500) // 500ms debounce

    return () => {
      clearTimeout(tid)
      ctrl.abort()
    }
  }, [selected, ruleViews, sgId])

  // ── Apply lifecycle ────────────────────────────────────────────
  //
  // Locked principle (do not weaken):
  //   Score-based and preflight gates surface WARNINGS to operators,
  //   never hard-block them. The override path is always available via
  //   the override modal — provided the operator records a rationale
  //   + acknowledges rollback. Same safety, but never a dead-end.
  //
  // Two-pass apply:
  //   1. First call: force=false, no lineage. If the backend accepts,
  //      we're done — show success.
  //   2. If the backend blocks (HTTP 200 with success=false +
  //      decision=BLOCK / blocked=true, OR HTTP 4xx with
  //      override_lineage_required, OR safety_warnings + force-needed
  //      message), open the override modal with the reasons. Operator
  //      writes rationale + acks rollback → second call with
  //      force=true + override_lineage. The backend (commit pending)
  //      then validates the lineage and proceeds with full snapshot +
  //      rollback safety.
  //
  // The card OWNS the HTTP call. Parent receives a notification via
  // onApplied(sgId, summary) for refresh purposes only.
  const buildRulePayload = (ruleIds: string[]) => {
    const sel = ruleViews.filter((r) => ruleIds.includes(r.rule_id))
    return sel.map((r) => {
      const m = /^(\d+)(?:-(\d+))?$/.exec(r.port_range || "")
      const fromPort = m ? parseInt(m[1], 10) : null
      const toPort = m ? (m[2] ? parseInt(m[2], 10) : fromPort) : null
      const dir =
        r.direction === "inbound" || r.direction === "ingress"
          ? "inbound"
          : "outbound"
      return {
        protocol: (r.protocol || "tcp").toLowerCase(),
        port: fromPort ?? undefined,
        port_range: toPort && fromPort !== toPort ? r.port_range : undefined,
        source: r.source,
        direction: dir,
      }
    })
  }

  const extractBlockReasons = (resp: any): string[] => {
    const reasons: string[] = []
    if (resp?.block_reason) reasons.push(String(resp.block_reason))
    if (resp?.message && !reasons.includes(resp.message))
      reasons.push(String(resp.message))
    if (Array.isArray(resp?.safety_warnings)) {
      for (const w of resp.safety_warnings) reasons.push(String(w))
    }
    if (Array.isArray(resp?.potential_impact)) {
      for (const i of resp.potential_impact) {
        reasons.push(
          typeof i === "string"
            ? i
            : i?.reason || i?.message || JSON.stringify(i),
        )
      }
    }
    // Score-based BLOCK details if present
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
    ruleIds: string[],
    force: boolean,
    overrideLineage?: Record<string, any>,
  ) => {
    const rules_to_remove = buildRulePayload(ruleIds)
    const body: Record<string, any> = {
      rules_to_remove,
      create_snapshot: true,
      force,
    }
    if (overrideLineage) body.override_lineage = overrideLineage
    const res = await fetch(`/api/proxy/security-groups/${sgId}/remediate`, {
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
    const selectedRuleIds = Array.from(selected)

    // First attempt — no force, no lineage. Backend's score-based
    // gate may block; if so we open the override modal.
    const first = await callRemediate(selectedRuleIds, false)
    if (first.ok && first.body?.success === true && !isBlockedResponse(first.body)) {
      // Clean success path.
      onApplied?.(sgId, {
        removed: (first.body.rules_removed || []).length,
        snapshot_id: first.body.snapshot_id || null,
      })
      // Refresh data so the rule disappears from the card.
      setSelected(new Set())
      // Trigger a refetch of gap-analysis
      setTimeout(() => {
        fetch(`/api/proxy/security-groups/${sgId}/rule-analysis`, {
          cache: "no-store",
        })
          .then((r) => r.json())
          .then((d: SGGapResponse) => {
            if (!d?.error) setData(d)
          })
          .catch(() => {})
      }, 1500)
      return
    }

    // Blocked path — open override modal with the reasons surfaced.
    const reasons = extractBlockReasons(first.body)
    if (reasons.length === 0) {
      reasons.push(
        "Backend declined to auto-apply but didn't return a structured reason. " +
          `HTTP ${first.status}. Override anyway?`,
      )
    }
    // Open the shared modal in form phase with identity pre-populated
    // from localStorage.
    setOverrideState({
      ...buildOverrideStateForOpen(reasons),
      selectedRuleIds,
    })
  }

  // Shared modal's onSubmit callback — lineage is fully assembled by
  // the shared modal (rationale + identity composed + ack + timestamps).
  // Our job: call the API with the captured rule selection, then
  // transition the shared modal's phase based on the response.
  const submitOverride = async (lineage: OverrideLineagePayload) => {
    try {
      const r = await callRemediate(overrideState.selectedRuleIds, true, lineage)
      if (r.ok && r.body?.success !== false) {
        const removed = (r.body.rules_removed || []).length
        const snap = r.body.snapshot_id || null
        setOverrideState((s) => ({
          ...s,
          phase: "success",
          resultMessage: `Removed ${removed} rule${removed === 1 ? "" : "s"} from ${sgId}.\nSnapshot: ${snap || "(not captured)"}`,
        }))
        onApplied?.(sgId, { removed, snapshot_id: snap })
        // Background refresh of the card data
        setTimeout(() => {
          fetch(`/api/proxy/security-groups/${sgId}/rule-analysis`, {
            cache: "no-store",
          })
            .then((rr) => rr.json())
            .then((d: SGGapResponse) => {
              if (!d?.error) {
                setData(d)
                setSelected(new Set())
              }
            })
            .catch(() => {})
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

      {/* Orphan-SG warning — fires when no resources depend on this SG.
          Rule-level remediation is moot for an orphan; the operator
          should consider deleting the SG entirely. The old modal
          surfaced this as "Orphan Security Group: CRITICAL" — we
          surface it here as a card-level banner so it's the first
          thing the operator sees, above the confidence card. */}
      {data.orphan_info?.is_orphan && (
        <div className="mx-4 mt-3 p-3 rounded-lg border-2 border-[#dc262640] bg-[#fef2f2]">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠</span>
            <div className="flex-1">
              <div className="text-sm font-bold text-[#991b1b]">
                Orphan Security Group · CRITICAL
              </div>
              <div className="text-xs text-[#7f1d1d] mt-1">
                No resources are attached to this Security Group
                {data.orphan_info.attached_eni_count === 0
                  ? " (0 ENIs)"
                  : null}
                . Removing individual rules has no effect on real
                traffic — the SG itself is a candidate for deletion.
                Coordinate with the platform owner before deleting,
                in case it's reserved for a planned rollout.
              </div>
            </div>
          </div>
        </div>
      )}

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
            {[T.SUGGEST, T.STAGED, T.AUTO].map((t) => (
              <div
                key={t}
                className="absolute top-0 h-2 w-0.5"
                style={{ left: `calc(${t}% - 1px)`, backgroundColor: "#94a3b8" }}
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
                style={{ left: `${T.STAGED}%`, transform: "translateX(-50%)" }}
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
                  const evidence = rule._evidence_confidence
                  const execution = rule._execution_confidence
                  const capped = execution < evidence
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
                        {/* Dual-display: when the action ceiling capped
                            the evidence score, show BOTH numbers so the
                            operator sees that evidence said 85 but
                            action-class limited execution to 39. The
                            badge color and threshold come from
                            execution_confidence (the routing-driving
                            value); raw evidence is the strikethrough
                            prefix chip. Mirrors the IAM modal pattern. */}
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
                                ? `Evidence ${evidence}% capped to ${execution}% by action class "${rule._action}" (ceiling ${rule._ceiling}). Routing follows execution_confidence.`
                                : `Per-rule execution confidence: ${execution}/100`
                            }
                          >
                            {execution}%
                          </span>
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

      {/* Preflight banner — shows BEFORE click-Apply (debounced
          /simulate dry-run on selection). BLOCK / EVIDENCE_CONFLICT are
          NOT routing bands; they surface here with reason + remediation
          steps so the operator isn't surprised at execute time. */}
      {preflight.kind !== "idle" && (
        <div
          className="px-4 py-2 border-t text-xs"
          style={{ borderColor: "var(--border, #e5e7eb)" }}
        >
          {preflight.kind === "checking" && (
            <div className="text-[var(--muted-foreground,#6b7280)] flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              Preflight checking selected rules…
            </div>
          )}
          {preflight.kind === "clear" && (
            <div className="text-emerald-700">
              <span className="font-semibold">✓ Preflight clear</span>
              {preflight.warnings.length > 0 && (
                <ul className="mt-1 ml-3 list-disc text-[var(--muted-foreground,#6b7280)] space-y-0.5">
                  {preflight.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {preflight.kind === "blocked" && (
            <div className="text-rose-700">
              <span className="font-semibold">⊘ Preflight blocked</span>
              <ul className="mt-1 ml-3 list-disc space-y-0.5">
                {preflight.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
                {preflight.warnings.map((w, i) => (
                  <li
                    key={`w-${i}`}
                    className="text-[var(--muted-foreground,#6b7280)]"
                  >
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preflight.kind === "error" && (
            <div className="text-amber-700">
              <span className="font-semibold">⚠ Preflight unavailable:</span>{" "}
              {preflight.message}
              <span className="text-[var(--muted-foreground,#6b7280)] ml-1">
                (Apply will still run; backend will re-check at execute time.)
              </span>
            </div>
          )}
        </div>
      )}

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
            disabled={
              selected.size === 0 ||
              preflight.kind === "checking" ||
              overrideState.phase === "applying"
            }
            onClick={handleApply}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[#8b5cf6] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#7c3aed] transition-colors"
            title={
              preflight.kind === "blocked"
                ? "Preflight raised warnings — click Apply to review and override with acknowledgment"
                : preflight.kind === "checking"
                  ? "Preflight in progress…"
                  : "Apply the selected rule removals (override modal opens if backend blocks)"
            }
          >
            {overrideState.phase === "applying" ? "Applying…" : "Apply selected"}
          </button>
        </div>
      </div>

      {/* Override modal — shared component from override-modal-shared.tsx.
          Renders form/applying/success/error phases; assembles the
          OverrideLineagePayload on submit and hands it to our
          submitOverride callback for the API call. Single source of
          truth across SG and S3 cards. */}
      <OverrideModalShared
        state={overrideState}
        setState={(next) =>
          setOverrideState({
            ...next,
            selectedRuleIds: overrideState.selectedRuleIds,
          })
        }
        acknowledgedTags={["score_based_block", "operator_override"]}
        rationalePlaceholder="e.g. Confirmed with @platform-team in #incidents that port 9999 was a leftover from a deprecated service; ticket NET-1842"
        onSubmit={submitOverride}
      />
    </div>
  )
}

export default SGRemediationCard
