"use client"

// Recommended Hardening panel — Slice 4 of the v2 redesign.
//
// This is Cyntro's differentiator on the page: closure-by-observation.
// We surface every action the backend has staged in
// risk_reduction.by_plane (iam / network / data buckets) with the
// projected score delta, gate status, and a one-click Apply that
// opens the corresponding existing remediation modal — IAM /
// SecurityGroup / S3 — keeping the operator inside the v2 page while
// reusing the battle-tested remediation flow underneath.
//
// Framing per `feedback_not_detection_response` — closure-by-observation,
// not alerting. Every recommendation reads "drop the actions that
// haven't been used in 90 days," not "fix this finding." Per
// `feedback_safety_language` we never say "safe" — we say what the
// gate is (AUTO / STAGED_AUTO / MANUAL_REVIEW) and what snapshot is
// available.

import { useMemo, useState } from "react"
import {
  Sparkles,
  ShieldAlert,
  Key,
  Database,
  Lock,
  ChevronDown,
  ChevronRight,
  ArrowRight,
} from "lucide-react"
import type {
  IdentityAttackPath,
  RiskReductionAction,
  PlaneRemediationBucket,
} from "@/components/identity-attack-paths/types"
import { resolveModalTarget, type ModalTarget } from "./remediation-target"

// Remediation modals to lazy-load when the operator clicks Apply.
// Imported inline at click time so the Slice 4 component doesn't
// pull all three modals into the initial v2 bundle.
import { IAMPermissionAnalysisModal } from "@/components/iam-permission-analysis-modal"
import { SGRemediationModal } from "@/components/sg-remediation-modal"
import { S3RemediationModal } from "@/components/s3-remediation-modal"

interface HardeningPanelProps {
  path: IdentityAttackPath
  systemName: string
  defaultCollapsed?: boolean
}

// Gate badge tone per memory `feedback_v44_execution_confidence_propagation`.
// AUTO / STAGED_AUTO / SUGGEST / MANUAL_REVIEW / INSUFFICIENT_DATA.
function GateBadge({ gate }: { gate: string | null | undefined }) {
  if (!gate) return null
  const g = gate.toUpperCase()
  const map: Record<string, { tone: string; label: string }> = {
    AUTO: { tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", label: "AUTO" },
    STAGED_AUTO: { tone: "border-blue-500/40 bg-blue-500/10 text-blue-300", label: "STAGED" },
    SUGGEST: { tone: "border-amber-500/40 bg-amber-500/10 text-amber-300", label: "SUGGEST" },
    MANUAL_REVIEW: { tone: "border-orange-500/40 bg-orange-500/10 text-orange-300", label: "REVIEW" },
    INSUFFICIENT_DATA: { tone: "border-slate-500/40 bg-slate-500/10 text-slate-300", label: "INSUFFICIENT DATA" },
  }
  const m = map[g] ?? { tone: "border-slate-500/40 bg-slate-500/10 text-slate-300", label: g }
  return (
    <span
      className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider rounded border px-1.5 py-0.5 ${m.tone}`}
    >
      {m.label}
    </span>
  )
}

// Plane meta — drives the section header icon + color.
const PLANE_META: Record<
  string,
  { label: string; icon: any; tone: string; bg: string; copy: string }
> = {
  network: {
    label: "NETWORK",
    icon: ShieldAlert,
    tone: "text-orange-300",
    bg: "border-orange-500/20 bg-orange-500/5",
    copy: "Close unused ingress and egress rules",
  },
  iam: {
    label: "IDENTITY",
    icon: Key,
    tone: "text-pink-300",
    bg: "border-pink-500/20 bg-pink-500/5",
    copy: "Drop permissions that haven't been used in 90 days",
  },
  data: {
    label: "DATA",
    icon: Database,
    tone: "text-violet-300",
    bg: "border-violet-500/20 bg-violet-500/5",
    copy: "Narrow resource access to observed actions only",
  },
  other: {
    label: "OTHER",
    icon: Sparkles,
    tone: "text-slate-300",
    bg: "border-slate-500/20 bg-slate-500/5",
    copy: "",
  },
}

export function HardeningPanel({ path, systemName, defaultCollapsed = false }: HardeningPanelProps) {
  const rr = path.risk_reduction
  const [openModal, setOpenModal] = useState<ModalTarget | null>(null)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  // Group actions by plane. Prefer the per-plane buckets when the
  // backend supplied them; fall back to a single bucket pulled from
  // top_actions otherwise.
  const planes = useMemo(() => {
    const list: Array<{ plane: string; bucket: PlaneRemediationBucket }> = []
    if (rr?.by_plane) {
      if (rr.by_plane.iam && rr.by_plane.iam.action_count > 0)
        list.push({ plane: "iam", bucket: rr.by_plane.iam })
      if (rr.by_plane.network && rr.by_plane.network.action_count > 0)
        list.push({ plane: "network", bucket: rr.by_plane.network })
      if (rr.by_plane.data && rr.by_plane.data.action_count > 0)
        list.push({ plane: "data", bucket: rr.by_plane.data })
    } else if (rr?.top_actions?.length) {
      // Fallback: bucketize top_actions by their .plane field
      const byPlane = new Map<string, RiskReductionAction[]>()
      for (const a of rr.top_actions) {
        const p = a.plane ?? "other"
        if (!byPlane.has(p)) byPlane.set(p, [])
        byPlane.get(p)!.push(a)
      }
      byPlane.forEach((acts, p) =>
        list.push({
          plane: p,
          bucket: {
            actions: acts,
            action_count: acts.length,
            achievable_score: rr.achievable_score ?? 0,
            delta: acts.reduce((s, a) => s + (a.impact ?? 0), 0),
          },
        }),
      )
    }
    return list
  }, [rr])

  const handleApply = (action: RiskReductionAction) => {
    const target = resolveModalTarget(action, path.nodes ?? [])
    if (target.kind === "none") {
      console.warn(`[v2 hardening] no modal for action`, action, target.reason)
      return
    }
    setOpenModal(target)
  }

  // No hardening data at all — render an honest empty state.
  if (!rr || planes.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-300" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-200">
            Recommended Hardening
          </span>
        </div>
        <div className="text-[11px] text-slate-500 italic mt-2">
          No closure recommendations computed for this path yet. Either the
          risk-reduction simulator hasn't run on this snapshot, or the path's
          nodes have no actionable narrowing opportunities (everything observed
          is already needed).
        </div>
      </div>
    )
  }

  const totalImpact = planes.reduce(
    (s, p) => s + (p.bucket.actions ?? []).reduce((ss, a) => ss + (a.impact ?? 0), 0),
    0,
  )
  const totalActions = planes.reduce((s, p) => s + p.bucket.action_count, 0)
  const lockedActions = planes.reduce(
    (s, p) => s + ((p.bucket.locked_count ?? 0) || 0),
    0,
  )

  return (
    <>
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-emerald-500/[0.06] transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
          )}
          <Sparkles className="h-4 w-4 text-emerald-300" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">
            Recommended Hardening
          </span>
          <span className="ml-auto text-[10px] text-slate-400">
            {totalActions} action{totalActions === 1 ? "" : "s"} across {planes.length} plane{planes.length === 1 ? "" : "s"}
          </span>
        </button>

        {!collapsed && (
          <>
            {/* Headline: current → achievable score */}
            {rr.current_score !== undefined && rr.achievable_score !== undefined && (
              <div className="px-4 pb-3 border-b border-emerald-500/15">
                {/* Reduction narrative when LLM is enabled */}
                {path.reduction_narrative && (
                  <div className="text-sm text-slate-200 leading-snug mb-3">
                    {path.reduction_narrative}
                  </div>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[9px] uppercase tracking-wider text-slate-500">
                      score
                    </span>
                    <span className="text-lg font-semibold text-slate-200 tabular-nums">
                      {rr.current_score}
                    </span>
                    <ArrowRight className="h-3 w-3 text-slate-500" />
                    <span className="text-lg font-semibold text-emerald-300 tabular-nums">
                      {rr.achievable_score}
                    </span>
                    {totalImpact > 0 && (
                      <span className="text-[11px] text-emerald-400 ml-1">
                        −{totalImpact}
                      </span>
                    )}
                  </div>
                  {lockedActions > 0 && (
                    <span className="text-[10px] text-slate-500">
                      · {lockedActions} locked (AWS-managed)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Per-plane recommendation buckets */}
            <div className="divide-y divide-emerald-500/10">
              {planes.map(({ plane, bucket }) => {
                const meta = PLANE_META[plane] ?? PLANE_META.other
                const Icon = meta.icon
                return (
                  <div key={plane} className={`${meta.bg} border-l-2 border-l-current ${meta.tone} px-4 py-3`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`h-3.5 w-3.5 ${meta.tone}`} />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-200">
                        {meta.label} · {bucket.action_count} action{bucket.action_count === 1 ? "" : "s"}
                      </span>
                      <span className="ml-auto text-[10px] text-emerald-400">
                        −{Math.round(bucket.delta)} pts
                      </span>
                    </div>
                    {meta.copy && (
                      <div className="text-[11px] text-slate-400 mb-2 italic">
                        {meta.copy}
                      </div>
                    )}
                    <div className="space-y-1.5">
                      {(bucket.actions ?? []).map((action, idx) => (
                        <ActionRow
                          key={`${plane}-${idx}`}
                          action={action}
                          onApply={() => handleApply(action)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer — caveat per feedback_safety_language: describe the
                fail-closed posture, don't claim "safe." */}
            <div className="px-4 py-2.5 text-[10px] text-slate-500 bg-slate-950/40 border-t border-emerald-500/10">
              Each Apply opens the standard remediation flow for that resource:
              dry-run preview → snapshot → execute → rollback available. The
              same UnifiedPipeline that powers the IAM, SG, and S3 remediation
              modals on the legacy page.
            </div>
          </>
        )}
      </div>

      {/* ─── Lazy-mount the right remediation modal on Apply ────── */}
      {openModal?.kind === "iam" && (
        <IAMPermissionAnalysisModal
          isOpen={true}
          onClose={() => setOpenModal(null)}
          roleName={openModal.roleName}
          systemName={systemName}
          identityType="role"
        />
      )}
      {openModal?.kind === "sg" && (
        <SGRemediationModal
          isOpen={true}
          onClose={() => setOpenModal(null)}
          sgId={openModal.sgId}
          sgName={openModal.sgName}
          systemName={systemName}
        />
      )}
      {openModal?.kind === "s3" && (
        <S3RemediationModal
          isOpen={true}
          onClose={() => setOpenModal(null)}
          bucketName={openModal.bucketName}
          systemName={systemName}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Single action row inside a plane bucket. Locked actions render
// disabled with the not_remediable reason; remediable actions get an
// Apply button.
// ─────────────────────────────────────────────────────────────────
function ActionRow({
  action,
  onApply,
}: {
  action: RiskReductionAction
  onApply: () => void
}) {
  const locked = action.not_remediable === true
  return (
    <div
      className={`flex items-start gap-2 p-2 rounded-md border ${
        locked
          ? "bg-slate-900/30 border-slate-800 opacity-60"
          : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-200">{action.action}</span>
          {action.node_name && (
            <span className="text-[10px] font-mono text-slate-500 truncate">
              · {action.node_name}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
          {action.impact > 0 && (
            <span className="text-emerald-400">−{Math.round(action.impact)} pts</span>
          )}
          {action.dominant_factor && (
            <span className="text-slate-500">
              · drives {action.dominant_factor.replaceAll("_", " ")}
            </span>
          )}
        </div>
        {locked && action.not_remediable_reason && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
            <Lock className="h-2.5 w-2.5" />
            {action.not_remediable_reason}
          </div>
        )}
      </div>
      <button
        onClick={onApply}
        disabled={locked}
        className={`shrink-0 text-[10px] font-semibold rounded-md px-2.5 py-1 border transition-colors ${
          locked
            ? "border-slate-800 text-slate-600 cursor-not-allowed"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
        }`}
      >
        Apply
      </button>
    </div>
  )
}
