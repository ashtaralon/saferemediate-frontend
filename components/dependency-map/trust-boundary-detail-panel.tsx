"use client"

// Right-rail detail panel for a selected workload in the Trust Boundary Map.
//
// Shows:
//  - Bucket badge + workload identity
//  - Internet capability flags (SG, IGW route) — why is it ACTIVE/LATENT?
//  - Observed traffic summary (counts only, no fabricated metrics)
//  - Recommendation card with confidence signal
//  - "Preview Safety Pipeline" button → opens LivePipelineModal
//
// Per feedback_remediation_safety_signals: the recommendation card
// surfaces the confidence_signal verbatim from the backend, never
// claims "safe", always says "no observed dependency in window" or
// equivalent.

import React from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  Lock,
  Network,
  Play,
  Server,
  Shield,
  ShieldOff,
  X,
} from "lucide-react"
import type {
  PostureWorkload,
  WorkloadBucket,
  PostureRecommendation,
} from "./trust-boundary-map"

// Light-theme palette to match the system page (the rest of cyntro.io
// is light, so the detail panel uses white background with dark text).
const BUCKET_INFO: Record<
  WorkloadBucket,
  { label: string; emoji: string; description: string; bg: string; text: string }
> = {
  ISOLATED: {
    label: "Isolated",
    emoji: "🟢",
    description: "No internet capability. Goal state.",
    bg: "bg-emerald-50 border-emerald-300",
    text: "text-emerald-800",
  },
  AWS_REDIRECTABLE: {
    label: "AWS-Redirectable",
    emoji: "🟡",
    description: "Uses AWS services via the internet gateway. Could be redirected via VPCE.",
    bg: "bg-amber-50 border-amber-300",
    text: "text-amber-800",
  },
  ACTIVE_INTERNET: {
    label: "Active Internet",
    emoji: "🟠",
    description: "Talks to non-AWS destinations on the internet. Validate; narrow SG egress.",
    bg: "bg-orange-50 border-orange-300",
    text: "text-orange-800",
  },
  LATENT_EXPOSURE: {
    label: "Latent Exposure",
    emoji: "🔴",
    description: "Open to internet, zero observed egress in the lookback window. Closable today.",
    bg: "bg-red-50 border-red-400",
    text: "text-red-800",
  },
}

interface TrustBoundaryDetailPanelProps {
  workload: PostureWorkload | null
  onClose: () => void
  onPreviewPipeline: (workload: PostureWorkload) => void
}

export function TrustBoundaryDetailPanel({
  workload,
  onClose,
  onPreviewPipeline,
}: TrustBoundaryDetailPanelProps) {
  if (!workload) return null
  const info = BUCKET_INFO[workload.bucket]
  const w = workload.workload
  const totals = workload.totals
  const internet_dests = (totals.aws_destinations || 0) + (totals.external_destinations || 0)

  return (
    <div className="w-[420px] rounded-xl border border-slate-200 bg-white shadow-lg p-4 max-h-[calc(100vh-180px)] overflow-y-auto shrink-0">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{info.emoji}</span>
          <div>
            <div className={`text-[10px] font-bold uppercase tracking-wider ${info.text}`}>
              {info.label}
            </div>
            <div className="text-sm font-semibold text-slate-900 font-mono truncate max-w-[280px]">
              {w.name || w.id}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900"
          aria-label="Close detail panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className={`mb-3 rounded-lg border ${info.bg} px-3 py-2 text-[11px] text-slate-800`}>
        {info.description}
      </div>

      {/* Identity */}
      <div className="mb-3">
        <div className="text-[9px] uppercase tracking-wider text-slate-600 font-bold mb-1">
          Identity
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <Server className="w-3 h-3 text-slate-500" />
            <span className="text-slate-600">Type</span>
            <span className="ml-auto text-slate-900 font-mono text-[10px] font-semibold">
              {w.node_type || "Unknown"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {w.subnet_is_public ? (
              <Globe className="w-3 h-3 text-amber-700" />
            ) : (
              <Lock className="w-3 h-3 text-emerald-700" />
            )}
            <span className="text-slate-600">Subnet</span>
            <span
              className={`ml-auto text-[10px] font-bold uppercase ${
                w.subnet_is_public ? "text-amber-700" : "text-emerald-700"
              }`}
            >
              {w.subnet_is_public ? "Public" : w.subnet_is_public === false ? "Private" : "?"}
            </span>
          </div>
        </div>
        <div className="mt-1 text-[10px] text-slate-500 font-mono truncate" title={w.subnet_name || ""}>
          {w.subnet_name || w.subnet_id || "no subnet"}
        </div>
      </div>

      {/* Capability flags */}
      <div className="mb-3">
        <div className="text-[9px] uppercase tracking-wider text-slate-600 font-bold mb-1">
          Internet Capability
        </div>
        <div className="space-y-1.5">
          <CapabilityRow
            label="SG egress to 0.0.0.0/0"
            active={workload.has_public_sg_egress}
          />
          <CapabilityRow
            label="Route table → IGW / NAT"
            active={workload.has_igw_route}
          />
          <div className="pt-1 mt-1 border-t border-slate-200">
            <CapabilityRow
              label="Reaches internet"
              active={workload.has_internet_capability}
              bold
            />
          </div>
        </div>
      </div>

      {/* Observed traffic */}
      <div className="mb-3">
        <div className="text-[9px] uppercase tracking-wider text-slate-600 font-bold mb-1">
          Observed Traffic (lookback window)
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">AWS dests</div>
            <div className="text-base font-bold text-slate-900">{totals.aws_destinations}</div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">External</div>
            <div className="text-base font-bold text-slate-900">{totals.external_destinations}</div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Internal</div>
            <div className="text-base font-bold text-slate-900">{totals.internal_destinations}</div>
          </div>
        </div>
        <div className="mt-1 text-[10px] text-slate-600 text-center">
          Total internet-facing destinations: <span className="text-slate-900 font-semibold">{internet_dests}</span>
        </div>
      </div>

      {/* Recommendation */}
      {workload.recommendation ? (
        <RecommendationCard
          recommendation={workload.recommendation}
          onPreview={() => onPreviewPipeline(workload)}
        />
      ) : (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-center">
          <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-emerald-700" />
          <div className="text-[11px] font-semibold text-emerald-900">No action needed</div>
          <div className="text-[10px] text-emerald-700 mt-0.5">
            Workload is in the goal state — isolated from the internet.
          </div>
        </div>
      )}
    </div>
  )
}

function CapabilityRow({
  label,
  active,
  bold,
}: {
  label: string
  active: boolean
  bold?: boolean
}) {
  const icon = active ? (
    <Network className="w-3 h-3 text-amber-700" />
  ) : (
    <Lock className="w-3 h-3 text-emerald-700" />
  )
  const text = active ? (
    <span className={`text-amber-700 ${bold ? "font-bold" : "font-semibold"}`}>YES</span>
  ) : (
    <span className={`text-emerald-700 ${bold ? "font-bold" : "font-semibold"}`}>NO</span>
  )
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      {icon}
      <span className={`text-slate-700 ${bold ? "font-semibold text-slate-900" : ""}`}>{label}</span>
      <span className="ml-auto text-[10px] uppercase tracking-wider">{text}</span>
    </div>
  )
}

function RecommendationCard({
  recommendation,
  onPreview,
}: {
  recommendation: PostureRecommendation
  onPreview: () => void
}) {
  // Type-aware tone — amber for closure (REMOVE/NARROW), emerald for
  // improvement (ADD VPCE). Light-theme palette matches the rest of
  // the page.
  const isImprovement = recommendation.type === "ADD_VPC_ENDPOINT"
  const tone = isImprovement
    ? "border-emerald-300 bg-emerald-50"
    : "border-amber-300 bg-amber-50"
  const heading = isImprovement ? "Proposed Improvement" : "Proposed Closure"
  const headingTone = isImprovement ? "text-emerald-900" : "text-amber-900"

  return (
    <div className={`rounded-lg border-2 ${tone} p-3`}>
      <div className="flex items-center gap-2 mb-2">
        <Shield className={`w-4 h-4 ${isImprovement ? "text-emerald-700" : "text-amber-700"}`} />
        <div className={`text-[10px] font-bold uppercase tracking-wider ${headingTone}`}>
          {heading}
        </div>
      </div>

      <div className="text-[12px] font-semibold text-slate-900 mb-1.5">
        {recommendation.action_description}
      </div>

      <div className="text-[11px] text-slate-700 leading-relaxed mb-3">
        {recommendation.confidence_signal}
      </div>

      <div className="text-[10px] text-slate-600 mb-3 font-medium">
        Scope: {recommendation.scope_workload_count} workload
        {recommendation.scope_workload_count === 1 ? "" : "s"}
      </div>

      <button
        type="button"
        onClick={onPreview}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-violet-500 bg-violet-600 hover:bg-violet-700 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white transition-colors shadow-sm"
      >
        <Play className="w-3.5 h-3.5" />
        Preview Safety Pipeline
      </button>

      <div className="mt-2 text-[9px] text-slate-500 text-center italic">
        Preview runs Simulate → Snapshot → Preflight without mutation.
        Approve to enable Canary → Validate → Apply with rollback gate.
      </div>
    </div>
  )
}

export default TrustBoundaryDetailPanel
