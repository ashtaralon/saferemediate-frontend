"use client"

import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { ErrorCard, LoadingCard, Section } from "./card-shell"
import {
  descriptorClass,
  heroNumberClass,
  scoreToneClass,
  unitClass,
} from "./styles"

/**
 * V3 Evidence Health card — editorial style.
 *
 * Replaces the V2 EvidenceHealthCard which was icon-heavy and
 * indigo-accented. Per the design language locked in
 * project_dashboard_v3_design_language.md: number is the protagonist,
 * minimal icons, muted palette, score-only per-source rows.
 */

type SourceSummary = {
  source_type: string
  enabled: boolean
  confidence_score: number
  missing_reason: string | null
}

type AccountCoverage = {
  account_id: string
  cloud: string
  aggregate_confidence: number
  sources: SourceSummary[]
  health: { healthy: number; degraded: number; missing: number; total: number }
}

type CoverageResponse = {
  accounts: AccountCoverage[]
  aggregate_confidence: number
  health: { healthy: number; degraded: number; missing: number; total: number }
  errors?: string[]
  no_accounts?: boolean
  message?: string
}

const SOURCE_LABELS: Record<string, string> = {
  CLOUDTRAIL_MGMT: "CloudTrail",
  CLOUDTRAIL_DATA: "CloudTrail (data)",
  VPC_FLOW: "VPC Flow Logs",
  IAM_ACCESS_ADVISOR: "IAM Access Advisor",
  IAM_ACCESS_ANALYZER: "IAM Access Analyzer",
  AWS_CONFIG: "AWS Config",
  X_RAY: "X-Ray",
  S3_ACCESS_LOGS: "S3 access logs",
  RDS_QUERY_LOGS: "RDS query logs",
}

export function EvidenceHealthCardV3() {
  const [data, setData] = useState<CoverageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/proxy/evidence/coverage", { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || `HTTP ${res.status}`)
      }
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading && !data) return <LoadingCard label="Evidence health" />
  if (error) return <ErrorCard label="Evidence health" error={error} onRetry={load} />
  if (!data) return null

  const refreshButton = (
    <button
      onClick={load}
      disabled={loading}
      className="text-slate-400 transition hover:text-slate-700"
      aria-label="Refresh"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
    </button>
  )

  // Honest empty state when the SignalSource subsystem hasn't populated.
  if (data.no_accounts) {
    return (
      <Section
        label="Evidence health"
        descriptor="Confidence in your AWS audit data sources"
        right={refreshButton}
      >
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
          No SignalSource nodes in graph yet. Audit scheduler populates every
          6 hours from real AWS API probes.
        </div>
      </Section>
    )
  }

  return (
    <Section
      label="Evidence health"
      descriptor="Aggregate is min across sources (weakest-link)"
      right={refreshButton}
    >
      <div className="flex items-baseline gap-3">
        <span className={`${heroNumberClass} ${scoreToneClass(data.aggregate_confidence)}`}>
          {data.aggregate_confidence.toFixed(0)}
        </span>
        <span className={unitClass}>/100</span>
      </div>

      <div className="mt-3 flex gap-4 text-sm">
        <span className="text-emerald-700">
          <span className="font-semibold">{data.health.healthy}</span>
          <span className="ml-1 text-slate-500">healthy</span>
        </span>
        <span className="text-amber-700">
          <span className="font-semibold">{data.health.degraded}</span>
          <span className="ml-1 text-slate-500">degraded</span>
        </span>
        <span className="text-rose-700">
          <span className="font-semibold">{data.health.missing}</span>
          <span className="ml-1 text-slate-500">missing</span>
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {data.accounts.map((acct) => (
          <div key={acct.account_id} className="border-t border-slate-100 pt-3">
            <div className={`${descriptorClass} mb-2 flex items-center justify-between`}>
              <span>
                {acct.cloud} · {acct.account_id}
              </span>
              <span className={`${scoreToneClass(acct.aggregate_confidence)} font-semibold`}>
                {acct.aggregate_confidence.toFixed(0)}
              </span>
            </div>
            <div className="space-y-1.5">
              {acct.sources.map((s, i) => (
                <div
                  key={`${s.source_type}-${i}`}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-slate-700">
                    {SOURCE_LABELS[s.source_type] ?? s.source_type}
                  </span>
                  <div className="flex items-center gap-2">
                    {s.missing_reason && (
                      <span className="rounded-sm bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-rose-700">
                        {s.missing_reason.replace(/_/g, " ")}
                      </span>
                    )}
                    <span
                      className={`${scoreToneClass(s.confidence_score)} font-mono text-sm font-semibold tabular-nums`}
                    >
                      {s.confidence_score.toFixed(0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {data.errors && data.errors.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-amber-700">
          {data.errors.length} account fetch{data.errors.length > 1 ? "es" : ""} failed
        </div>
      )}
    </Section>
  )
}
