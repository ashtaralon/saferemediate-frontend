"use client"

import { useEffect, useState } from "react"
import { Database, RefreshCw, AlertCircle, CheckCircle2, MinusCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Evidence Health card — honest readout of SignalSource confidence per
 * AWS audit data source. Calls /api/proxy/evidence/coverage (org-wide
 * fan-out across all accounts in the graph).
 *
 * Honesty rules:
 *   - aggregate_confidence is the backend's min-across-sources; if
 *     anything is disabled in customer AWS, it's reflected here, not
 *     papered over
 *   - "no_accounts" empty-state surfaces literally — the graph has no
 *     SignalSource nodes yet
 *   - Per-source rows show real backend metadata: enabled flag, score,
 *     missing_reason
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

function scoreColor(score: number): string {
  if (score >= 75) return "text-[#22c55e]"
  if (score > 0) return "text-[#eab308]"
  return "text-[#ef4444]"
}

function HealthBadge({
  count,
  kind,
}: {
  count: number
  kind: "healthy" | "degraded" | "missing"
}) {
  const cfg = {
    healthy: { Icon: CheckCircle2, color: "text-[#22c55e]" },
    degraded: { Icon: AlertCircle, color: "text-[#eab308]" },
    missing: { Icon: MinusCircle, color: "text-[#ef4444]" },
  }[kind]
  const Icon = cfg.Icon
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Icon className={`h-4 w-4 ${cfg.color}`} />
      <span className="font-medium">{count}</span>
      <span className="text-muted-foreground capitalize">{kind}</span>
    </div>
  )
}

export function EvidenceHealthCard() {
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

  return (
    <Card className="rounded-[24px] border-[#e5e7eb] bg-white shadow-[0_20px_60px_-40px_rgba(0,0,0,0.15)]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Database className="h-5 w-5 text-[#6366f1]" />
            Evidence Health
          </CardTitle>
          <button
            onClick={load}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground transition"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Confidence in your AWS audit data sources (aggregate = weakest source)
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !data && (
          <div className="text-sm text-muted-foreground">Loading evidence sources…</div>
        )}

        {error && (
          <div className="text-sm text-[#ef4444]">
            Failed to load: {error}
          </div>
        )}

        {data?.no_accounts && (
          <div className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
            No `SignalSource` nodes in the graph yet. The evidence-audit scheduler
            populates these every {6} hours from real AWS API probes. Once it
            runs you'll see real data here.
          </div>
        )}

        {data && !data.no_accounts && (
          <>
            <div className="flex items-baseline gap-3">
              <div className={`text-4xl font-bold ${scoreColor(data.aggregate_confidence)}`}>
                {data.aggregate_confidence.toFixed(1)}
              </div>
              <div className="text-sm text-muted-foreground">aggregate / 100</div>
            </div>

            <div className="flex gap-4 flex-wrap">
              <HealthBadge count={data.health.healthy} kind="healthy" />
              <HealthBadge count={data.health.degraded} kind="degraded" />
              <HealthBadge count={data.health.missing} kind="missing" />
            </div>

            {data.accounts.map((acct) => (
              <div key={acct.account_id} className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {acct.cloud} · {acct.account_id}
                  </span>
                  <span className={scoreColor(acct.aggregate_confidence)}>
                    {acct.aggregate_confidence.toFixed(1)}
                  </span>
                </div>
                <div className="space-y-1">
                  {acct.sources.map((s, i) => (
                    <div
                      key={`${s.source_type}-${i}`}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-foreground">
                        {SOURCE_LABELS[s.source_type] ?? s.source_type}
                      </span>
                      <div className="flex items-center gap-2">
                        {s.missing_reason && (
                          <span className="text-xs text-[#ef4444] uppercase tracking-wide">
                            {s.missing_reason.replace(/_/g, " ")}
                          </span>
                        )}
                        <span className={`font-mono text-sm ${scoreColor(s.confidence_score)}`}>
                          {s.confidence_score.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {data.errors && data.errors.length > 0 && (
              <div className="text-xs text-[#eab308] pt-2 border-t">
                {data.errors.length} account fetch{data.errors.length > 1 ? "es" : ""} failed
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
