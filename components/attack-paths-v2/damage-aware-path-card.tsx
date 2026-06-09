"use client"

import { useMemo } from "react"
import {
  AlertTriangle,
  Check,
  Crown,
  Loader2,
  Shield,
  Sparkles,
  X,
} from "lucide-react"
import type {
  CrownJewelSummary,
  IdentityAttackPath,
} from "@/components/identity-attack-paths/types"
import { isPrincipalNodeType } from "@/components/identity-attack-paths/types"
import type { DamageScopePayload } from "./damage-scope-drawer"
import {
  buildEffectiveDamageMatrix,
  type DamageVerbKey,
  verbLabel,
} from "./effective-damage-matrix"
import { pathIdentityLabel, pathSourceLabel } from "./path-damage-summary"

interface DamageAwarePathCardProps {
  path: IdentityAttackPath
  jewel: CrownJewelSummary | null
  scope: DamageScopePayload | null
  scopeLoading?: boolean
  scopeError?: string | null
}

function confidenceTone(label: string): string {
  switch (label) {
    case "Observed":
    case "Confirmed":
      return "text-emerald-300"
    case "Configured":
      return "text-amber-300"
    case "Blocked":
      return "text-red-300"
    default:
      return "text-slate-400"
  }
}

function MatrixRow({
  verb,
  allowed,
  confidence,
  detail,
}: {
  verb: DamageVerbKey
  allowed: boolean
  confidence: string
  detail?: string
}) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="w-14 text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
        {verbLabel(verb)}
      </span>
      <span className="shrink-0 mt-0.5">
        {allowed ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" aria-label="allowed" />
        ) : (
          <X className="h-3.5 w-3.5 text-slate-600" aria-label="not allowed" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${confidenceTone(confidence)}`}>
          {confidence}
        </span>
        {detail && (
          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{detail}</p>
        )}
      </div>
    </div>
  )
}

export function DamageAwarePathCard({
  path,
  jewel,
  scope,
  scopeLoading,
  scopeError,
}: DamageAwarePathCardProps) {
  const hasObservedHop = useMemo(
    () => (path.edges ?? []).some((e) => e.is_observed),
    [path],
  )

  const matrix = useMemo(
    () => buildEffectiveDamageMatrix(path.damage_capability, scope, hasObservedHop),
    [path.damage_capability, scope, hasObservedHop],
  )

  const topFix = path.risk_reduction?.top_actions?.[0]
  const lpLevel = scope?.lp_confidence?.level

  const blastImpact = useMemo(() => {
    const brs = path.target_blast_radius
    if (brs?.rationale?.length) {
      return brs.rationale[0]
    }
    const role = (path.nodes ?? []).find((n) => n.type === "IAMRole")
    const profiles = role?.infra_context?.instance_profiles ?? []
    if (profiles.length > 1) {
      return `Role shared across ${profiles.length} instance profiles — LP change may affect multiple workloads`
    }
    if (profiles.length === 1) {
      return "Role attached to 1 instance profile on this path"
    }
    return null
  }, [path])
  const expectedResult =
    scope?.narrative?.post_remediation ??
    scope?.scope_post_lp?.headline ??
    path.risk_reduction?.reduction_summary

  const whyLines = useMemo(() => {
    const lines: Array<{ label: string; text: string; confidence: string }> = []
    const gates = path.damage_capability?.gates
    if (gates) {
      lines.push({
        label: "Network",
        text: gates.network_reachable
          ? "Reachable through network controls on this path"
          : gates.network_reason ?? "Blocked by network controls",
        confidence: gates.network_reachable ? "Configured" : "Blocked",
      })
    }
    const directActions = path.damage_capability?.direct_actions ?? []
    if (directActions.length) {
      const shown = directActions.slice(0, 4).join(", ")
      const more = directActions.length > 4 ? ` (+${directActions.length - 4})` : ""
      lines.push({
        label: "IAM",
        text: `${shown}${more}`,
        confidence: hasObservedHop ? "Confirmed" : "Configured",
      })
    } else if (scope?.scope_today?.headline) {
      lines.push({
        label: "IAM",
        text: scope.scope_today.headline,
        confidence: "Configured",
      })
    }
    if (scope?.scope_observed?.headline) {
      lines.push({
        label: "Observed",
        text: String(scope.scope_observed.headline),
        confidence: "Observed",
      })
    }
    if (scope?.scope_post_lp?.resource_policy_defense_note) {
      lines.push({
        label: "Bucket policy",
        text: String(scope.scope_post_lp.resource_policy_defense_note),
        confidence: "Configured",
      })
    }
    if (scope?.scope_post_lp?.scp_defense_note) {
      lines.push({
        label: "Org SCP",
        text: String(scope.scope_post_lp.scp_defense_note),
        confidence: "Blocked",
      })
    }
    if (lines.length === 0) {
      lines.push({
        label: "Signals",
        text: path.damage_narrative ?? path.damage_capability?.reason ?? "Insufficient signals for this jewel type",
        confidence: "Unknown",
      })
    }
    return lines
  }, [path, scope, hasObservedHop])

  const chainLine = useMemo(() => {
    const source = pathSourceLabel(path)
    const identity = pathIdentityLabel(path)
    const target = jewel?.name ?? path.nodes?.[path.nodes.length - 1]?.name ?? "crown jewel"
    return `${source} → ${identity} → ${target}`
  }, [path, jewel])

  const pathStatus = hasObservedHop ? "Observed" : path.evidence_type === "observed" ? "Observed" : "Configured"

  return (
    <div
      className="mx-6 mt-4 mb-2 rounded-xl border border-slate-700/80 bg-slate-900/50 overflow-hidden"
      data-testid="damage-aware-path-card"
    >
      <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-950/60">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-300 shrink-0" />
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-100">
            Damage-Aware Path to Crown Jewel
          </h2>
          {jewel && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-amber-300 font-mono truncate max-w-[200px]" title={jewel.name}>
              <Crown className="h-3 w-3 shrink-0" />
              {jewel.name}
            </span>
          )}
        </div>
        <p className="text-[10px] text-slate-500 mt-1">Path · Damage · Least-Privilege Fix</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/60">
        {/* Path */}
        <section className="px-4 py-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Path</div>
          <p className="text-sm text-slate-100 font-mono leading-snug">{chainLine}</p>
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <span className={`uppercase tracking-wider font-semibold ${pathStatus === "Observed" ? "text-emerald-300" : "text-amber-300"}`}>
              {pathStatus}
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">{path.hop_count} hop{path.hop_count === 1 ? "" : "s"}</span>
            {(path.nodes ?? []).some((n) => isPrincipalNodeType(n.type) && n.name === "root") && (
              <>
                <span className="text-slate-600">·</span>
                <span className="text-red-300 font-semibold uppercase">Root credentials</span>
              </>
            )}
          </div>
          {path.damage_narrative && (
            <p className="text-[12px] text-slate-300 leading-snug italic">{path.damage_narrative}</p>
          )}
        </section>

        {/* Damage matrix */}
        <section className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Damage on jewel</div>
          {scopeLoading && !scope ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading scope…
            </div>
          ) : (
            <div className="divide-y divide-slate-800/40">
              {(["read", "write", "delete", "admin"] as DamageVerbKey[]).map((v) => (
                <MatrixRow
                  key={v}
                  verb={v}
                  allowed={matrix[v].allowed}
                  confidence={matrix[v].confidence}
                  detail={matrix[v].detail}
                />
              ))}
            </div>
          )}
          {scopeError && (
            <p className="text-[11px] text-amber-400/90 mt-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Scope unavailable — showing configured signals only
            </p>
          )}
        </section>
      </div>

      {/* Why */}
      <section className="px-4 py-3 border-t border-slate-800/60 bg-slate-950/30">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Why</div>
        <ul className="space-y-1.5">
          {whyLines.map((w) => (
            <li key={w.label} className="text-[11px] leading-snug">
              <span className="text-slate-500 uppercase tracking-wider text-[9px] mr-2">{w.label}</span>
              <span className="text-slate-300">{w.text}</span>
              <span className={`ml-2 text-[9px] font-semibold uppercase ${confidenceTone(w.confidence)}`}>
                {w.confidence}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* LP fix + expected result */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/60 border-t border-slate-800/60">
        <section className="px-4 py-3 bg-emerald-500/[0.03]">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-400 mb-1">
            <Sparkles className="h-3 w-3" />
            Recommended LP fix
          </div>
          {topFix ? (
            <div>
              <p className="text-sm text-slate-100">{topFix.action}</p>
              {topFix.node_name && (
                <p className="text-[11px] font-mono text-slate-500 mt-0.5">on {topFix.node_name}</p>
              )}
              {topFix.impact > 0 && (
                <p className="text-[10px] text-emerald-400 mt-1">−{Math.round(topFix.impact)} path score</p>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 italic">No LP recommendation computed for this path yet</p>
          )}
        </section>
        <section className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Expected result</div>
          <p className="text-sm text-slate-200 leading-snug">
            {expectedResult ?? "Post-LP scope will appear after damage-scope loads"}
          </p>
          {scope?.damage_reduction_percent != null && scope.damage_reduction_percent > 0 && (
            <p className="text-[10px] text-emerald-400 mt-1">
              ~{Math.round(scope.damage_reduction_percent)}% dangerous scope removed (configured basis)
            </p>
          )}
        </section>
      </div>

      {/* Confidence */}
      <div className="px-4 py-2.5 border-t border-slate-800/60 bg-slate-950/40 flex flex-wrap items-center gap-3 text-[10px]">
        <span className="text-slate-500 uppercase tracking-wider">LP confidence</span>
        {lpLevel ? (
          <span
            className={`font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
              lpLevel.toUpperCase() === "AUTO"
                ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                : "border-amber-500/40 text-amber-300 bg-amber-500/10"
            }`}
          >
            {lpLevel}
          </span>
        ) : (
          <span className="text-slate-500">Unknown</span>
        )}
        <span className="text-slate-600 hidden sm:inline">·</span>
        <span className="text-slate-500">
          Remove dangerous damage, preserve required access
        </span>
        {blastImpact && (
          <>
            <span className="text-slate-600 hidden sm:inline">·</span>
            <span
              className={`${
                lpLevel && lpLevel.toUpperCase() !== "AUTO"
                  ? "text-amber-300"
                  : "text-slate-400"
              }`}
              title="Blast impact if this role is narrowed"
            >
              Blast: {blastImpact}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
