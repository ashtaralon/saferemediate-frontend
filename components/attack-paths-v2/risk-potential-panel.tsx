"use client"

/**
 * RiskPotentialPanel — chain-aware Risk Potential cards for one SG
 * on the active attack path.
 *
 * Source of truth: /api/proxy/exposure/findings/sg/{sgId}. When the
 * backend feature flag CYNTRO_EXPOSURE_FINDINGS_ENABLED is on, the
 * proxy returns the rendered DamageStatement + ExposureFinding wire
 * shape; we render one card per finding, severity-sorted.
 *
 * When the proxy returns 404 (flag off, route invisible) or any
 * error, this component returns null so PotentialDamageSection
 * cleanly falls back to the legacy DamagePanel — no broken state
 * ever reaches the operator.
 */

import type { ComponentType } from "react"
import { useCallback, useEffect, useState } from "react"
import {
  AlertOctagon,
  AlertTriangle,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  RefreshCw,
  ShieldAlert,
} from "lucide-react"
import type {
  ExposureFindingEntry,
  ExposureFindingsResponse,
  ExposureSeverity,
} from "./exposure-findings-types"

interface RiskPotentialPanelProps {
  sgId: string
  /** Forwarded to parent so it can decide whether to render this
   *  panel or fall back to the legacy DamagePanel. Called with
   *  `true` once the proxy returns 200 with at least one finding;
   *  `false` on 404 / network error / empty findings. */
  onAvailability?: (available: boolean) => void
}

const SEV_THEME: Record<
  ExposureSeverity,
  { border: string; chip: string; headline: string; bg: string }
> = {
  CRITICAL: {
    border: "border-l-red-500",
    chip: "bg-red-500/15 text-red-200 border border-red-500/40",
    headline: "text-red-200",
    bg: "bg-red-500/[0.04]",
  },
  HIGH: {
    border: "border-l-amber-500",
    chip: "bg-amber-500/15 text-amber-200 border border-amber-500/40",
    headline: "text-amber-200",
    bg: "bg-amber-500/[0.04]",
  },
  MEDIUM: {
    border: "border-l-blue-500",
    chip: "bg-blue-500/15 text-blue-200 border border-blue-500/40",
    headline: "text-blue-200",
    bg: "bg-blue-500/[0.04]",
  },
  LOW: {
    border: "border-l-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-200 border border-emerald-500/40",
    headline: "text-emerald-200",
    bg: "bg-emerald-500/[0.04]",
  },
}

function sevIcon(sev: ExposureSeverity) {
  if (sev === "CRITICAL") return <AlertOctagon className="w-3.5 h-3.5" />
  if (sev === "HIGH") return <AlertTriangle className="w-3.5 h-3.5" />
  if (sev === "MEDIUM") return <ShieldAlert className="w-3.5 h-3.5" />
  return <Layers className="w-3.5 h-3.5" />
}

function observedIcon(hasObs: boolean) {
  return hasObs ? (
    <Eye className="w-3 h-3" />
  ) : (
    <EyeOff className="w-3 h-3" />
  )
}

export function RiskPotentialPanel({
  sgId,
  onAvailability,
}: RiskPotentialPanelProps) {
  const [data, setData] = useState<ExposureFindingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(
    async (refresh = false) => {
      setError(null)
      if (refresh) setRefreshing(true)
      try {
        const qs = refresh ? "?refresh=true" : ""
        const res = await fetch(
          `/api/proxy/exposure/findings/sg/${encodeURIComponent(sgId)}${qs}`,
          { cache: refresh ? "no-store" : "default" },
        )
        if (res.status === 404) {
          onAvailability?.(false)
          setError("not_available")
          return
        }
        if (!res.ok) {
          onAvailability?.(false)
          setError(`backend_${res.status}`)
          return
        }
        const body = (await res.json()) as ExposureFindingsResponse
        if (!body.findings || body.findings.length === 0) {
          onAvailability?.(false)
          setData(body)
          return
        }
        onAvailability?.(true)
        setData(body)
      } catch (e: unknown) {
        const err = e as { message?: string }
        onAvailability?.(false)
        setError(err?.message || "fetch_failed")
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [sgId, onAvailability],
  )

  useEffect(() => {
    setLoading(true)
    setData(null)
    fetchData(false)
  }, [sgId, fetchData])

  // Loading: render nothing while we figure out availability — the
  // parent will keep the legacy DamagePanel visible (or show its own
  // skeleton) until onAvailability resolves.
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
        Loading Risk Potential&hellip;
      </div>
    )
  }

  // Error or no findings → render nothing; parent falls back.
  if (error || !data || data.findings.length === 0) {
    return null
  }

  const { meta, findings } = data

  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-700/40 flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-slate-100">
            Risk potential
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            What an attacker on the internet can actually do, ranked by
            how bad it gets.{" "}
            <span className="text-slate-500">
              {meta.total} finding{meta.total === 1 ? "" : "s"} &middot;{" "}
              {meta.observation_window_days}d observation
            </span>
          </div>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs text-slate-300 hover:text-slate-100 hover:bg-slate-800/60 border border-slate-700/50 disabled:opacity-50"
          title="Force-bust upstream cache. Use after applying a remediation."
        >
          <RefreshCw
            className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {/* Severity rollup pills */}
      <div className="px-5 py-2 border-b border-slate-700/40 flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-400">
        <span>By severity:</span>
        {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as ExposureSeverity[]).map(
          (sev) => {
            const count = meta.by_severity?.[sev] ?? 0
            if (count === 0) return null
            const t = SEV_THEME[sev]
            return (
              <span
                key={sev}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${t.chip}`}
              >
                {sevIcon(sev)} {count} {sev.toLowerCase()}
              </span>
            )
          },
        )}
      </div>

      {/* Finding cards */}
      <div className="px-5 py-4 space-y-3">
        {findings.map((entry) => (
          <FindingCard key={entry.finding.finding_id} entry={entry} />
        ))}
      </div>

      <div className="px-5 py-2 border-t border-slate-800/60 text-[10px] text-slate-500 text-center">
        Real chain from Neo4j &middot; chain-aware severity classifier
        &middot; no fabrication
      </div>
    </div>
  )
}

function FindingCard({ entry }: { entry: ExposureFindingEntry }) {
  const { finding, statement } = entry
  const t = SEV_THEME[finding.severity]
  return (
    <div
      className={`rounded-md border border-slate-700/40 ${t.bg} border-l-2 ${t.border} p-3.5`}
    >
      {/* Chip row */}
      <div className="flex items-center gap-2 mb-2 flex-wrap text-[11px]">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${t.chip}`}
        >
          {sevIcon(finding.severity)} {finding.severity}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/60 text-slate-400 text-[10px] uppercase tracking-wider">
          {statement.layer_chip}
        </span>
        <span className="text-slate-300 font-mono text-[12px]">
          {statement.category_label}
        </span>
        {statement.source_label && (
          <span className="text-slate-500 text-[11px]">
            {statement.source_label}
          </span>
        )}
        {statement.observed_pill && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-400">
            {observedIcon(finding.has_observed_terminal_activity)}
            {statement.observed_pill}
          </span>
        )}
      </div>

      {/* Headline + supporting */}
      <p
        className={`text-[14px] font-medium leading-snug mb-1.5 ${t.headline}`}
      >
        {statement.headline}
      </p>
      {statement.supporting && (
        <p className="text-[12px] text-slate-400 mb-2 leading-snug">
          {statement.supporting}
        </p>
      )}

      {/* Evidence — per-bucket lines (SG findings) OR summary string */}
      {statement.evidence_lines && statement.evidence_lines.length > 0 && (
        <div className="bg-slate-950/40 rounded px-2.5 py-2 my-2 text-[11px] space-y-0.5 font-mono">
          {statement.evidence_lines.map((line, i) => (
            <div key={i} className="text-slate-300">
              {line}
            </div>
          ))}
        </div>
      )}
      {statement.evidence_summary && !statement.evidence_lines?.length && (
        <div className="text-[11px] text-slate-500 font-mono my-2">
          {statement.evidence_summary}
        </div>
      )}

      {/* CTA */}
      <div className="mt-2">
        <button
          onClick={() => {
            // Routes the click into chat where Cyntro's remediation
            // dispatcher takes over. Two-step today; direct modal
            // wiring is G3 in the follow-up.
            const w = window as unknown as {
              sendPrompt?: (text: string) => void
            }
            if (typeof w.sendPrompt === "function") {
              w.sendPrompt(statement.recommendation_prompt)
            } else {
              // Plain copy-to-clipboard fallback so the operator can
              // paste into Cyntro chat manually if sendPrompt isn't
              // wired in this surface yet.
              void navigator.clipboard
                ?.writeText(statement.recommendation_prompt)
                .catch(() => {})
              console.log(
                "[risk-potential] recommendation_prompt:",
                statement.recommendation_prompt,
              )
            }
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium bg-slate-800/80 hover:bg-slate-700/80 text-slate-100 border border-slate-700"
        >
          {statement.recommendation_label}
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

/**
 * PotentialDamageSection — drop-in replacement for `<DamagePanel
 * path={path} />` in path-analysis-panel.tsx.
 *
 * Picks the primary SG on the path (prefers public-ingress SGs),
 * fetches Risk Potential, renders it when available, otherwise
 * renders the legacy DamagePanel — no broken state ever surfaces.
 *
 * Backwards-compatible: when `CYNTRO_EXPOSURE_FINDINGS_ENABLED=false`
 * on Render the proxy returns 404 and this component renders exactly
 * the legacy DamagePanel that was here before.
 */
export function PotentialDamageSection({
  path,
  DamagePanelFallback,
}: {
  path: { nodes?: Array<{ id?: string; type?: string; lane?: string }> }
  DamagePanelFallback: ComponentType<{ path: any }>
}) {
  // Pick the primary SG on the path. Prefer an SG node by type/lane.
  // The exposure pipeline keys on SG id, so we need a SecurityGroup-
  // typed node. Falls back to null when the path has no SG.
  const sgId = (() => {
    const nodes = path?.nodes ?? []
    const sgNode = nodes.find((n) => {
      const t = String(n?.type ?? "").toLowerCase()
      const lane = String(n?.lane ?? "").toLowerCase()
      return (
        t.includes("securitygroup") ||
        t === "sg" ||
        lane === "security_group"
      )
    })
    return sgNode?.id || null
  })()

  const [riskAvailable, setRiskAvailable] = useState<boolean | null>(null)

  // No SG on the path → only legacy DamagePanel makes sense
  if (!sgId) {
    return <DamagePanelFallback path={path} />
  }

  return (
    <>
      <RiskPotentialPanel
        sgId={sgId}
        onAvailability={(av) => setRiskAvailable(av)}
      />
      {/* Render legacy DamagePanel when Risk Potential isn't
          available — flag off, backend down, or 0 findings. */}
      {riskAvailable === false && <DamagePanelFallback path={path} />}
    </>
  )
}
